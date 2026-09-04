import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type ExamStatus, Prisma } from '@prisma/client';
import type { TeacherConductedExam } from '@exam/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';
import { AuditService } from '../audit/audit.service';
import type { AddExamQuestionDto, CreateExamDto, UpdateExamDto } from './dto/exam.dto';
import { ExamAccessService } from './exam-access.service';
import { ADMIN_EDITABLE_STATUSES, canTransition } from './exam-state';
import { examListSelect, examQuestionSelect, examSelect } from './exam.select';

interface ExamHandle {
  id: number;
  publicId: string;
  status: ExamStatus;
  createdByTeacherId: number;
  coursePartPublicId: string;
  departmentId: number;
  facultyId: number;
}

@Injectable()
export class ExamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: ExamAccessService,
  ) {}

  private async loadExam(publicId: string): Promise<ExamHandle> {
    const exam = await this.prisma.db.exam.findFirst({
      where: { publicId },
      select: {
        id: true,
        publicId: true,
        status: true,
        createdByTeacherId: true,
        coursePart: {
          select: {
            publicId: true,
            course: {
              select: {
                semester: {
                  select: {
                    batch: {
                      select: {
                        program: {
                          select: {
                            departmentId: true,
                            department: { select: { facultyId: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    const program = exam.coursePart.course.semester.batch.program;
    return {
      id: exam.id,
      publicId: exam.publicId,
      status: exam.status,
      createdByTeacherId: exam.createdByTeacherId,
      coursePartPublicId: exam.coursePart.publicId,
      departmentId: program.departmentId,
      facultyId: program.department.facultyId,
    };
  }

  private isAdmin(user: AuthUser): boolean {
    return user.roles.some((r) => r.role === 'admin' || r.role === 'super_admin');
  }

  private async assertOwner(user: AuthUser, exam: ExamHandle): Promise<void> {
    const teacher = await this.access.requireTeacher(user);
    if (exam.createdByTeacherId !== teacher.id) {
      throw new ForbiddenException('You do not own this exam');
    }
  }

  /**
   * Authoring guard for exam edits (build/submit): the owning teacher, OR an
   * admin / super_admin / department_head acting within the exam's department
   * scope. Lets admins build and manage exams exactly like the teacher panel.
   */
  private async assertCanAuthorExam(user: AuthUser, exam: ExamHandle): Promise<void> {
    const isStaff = user.roles.some(
      (r) => r.role === 'admin' || r.role === 'super_admin' || r.role === 'department_head',
    );
    const isTeacher = user.roles.some((r) => r.role === 'teacher');
    if (isTeacher) {
      const teacher = await this.access.requireTeacher(user);
      if (exam.createdByTeacherId === teacher.id) return;
      if (!isStaff) throw new ForbiddenException('You do not own this exam');
    }
    if (isStaff) {
      this.access.assertAdminScope(user, exam);
      return;
    }
    throw new ForbiddenException('You do not own this exam');
  }

  private assertTransition(from: ExamStatus, to: ExamStatus): void {
    if (!canTransition(from, to)) {
      throw new BadRequestException(`Invalid exam transition: ${from} → ${to}`);
    }
  }

  private async changeStatus(
    user: AuthUser,
    ip: string,
    exam: ExamHandle,
    to: ExamStatus,
    action: string,
    extra: Prisma.ExamUpdateInput = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exam.update({
        where: { publicId: exam.publicId },
        data: { status: to, ...extra },
        select: examSelect,
      });
      await this.audit.recordTx(tx, {
        actorUserId: user.id,
        action,
        entity: 'Exam',
        entityId: exam.publicId,
        before: { status: exam.status },
        after: { status: to },
        ip,
      });
      return updated;
    });
  }

  private async recomputeTotal(tx: Prisma.TransactionClient, examId: number): Promise<number> {
    const eqs = await tx.examQuestion.findMany({
      where: { examId },
      select: { marksOverride: true, question: { select: { marks: true } } },
    });
    const total = eqs.reduce((s, e) => s + (e.marksOverride ?? e.question.marks), 0);
    await tx.exam.update({ where: { id: examId }, data: { totalMarks: total } });
    return total;
  }

  // ─────────────────────────────── CRUD ───────────────────────────────
  async createExam(user: AuthUser, ip: string, dto: CreateExamDto) {
    const isAdminLike = user.roles.some((r) =>
      ['admin', 'super_admin', 'department_head'].includes(r.role),
    );
    const ctx = isAdminLike
      ? await this.access.requireAuthorablePartForAdmin(user, dto.coursePartPublicId)
      : await this.access.requireAuthorablePart(user, dto.coursePartPublicId);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) throw new BadRequestException('endAt must be after startAt');

    return this.prisma.$transaction(async (tx) => {
      const exam = await tx.exam.create({
        data: {
          coursePartId: ctx.coursePartId,
          createdByTeacherId: ctx.teacherId,
          title: dto.title,
          instructions: dto.instructions ?? null,
          startAt,
          endAt,
          durationMinutes: dto.durationMinutes,
          totalMarks: 0,
          status: 'draft',
          settings: dto.settings as unknown as Prisma.InputJsonValue,
        },
        select: examSelect,
      });
      await this.audit.recordTx(tx, {
        actorUserId: user.id,
        action: 'exam.create',
        entity: 'Exam',
        entityId: exam.publicId,
        after: { title: dto.title, status: 'draft' },
        ip,
      });
      return exam;
    });
  }

  /** Every exam the current teacher owns (admin: all in scope; department_head: their department).
   *  Pass `departmentPublicId` to further restrict to one department (admin/dept-head only). */
  async listExams(user: AuthUser, departmentPublicId?: string) {
    let where: Prisma.ExamWhereInput;
    if (this.isAdmin(user)) {
      where = { deletedAt: null };
    } else if (user.roles.some((r) => r.role === 'department_head')) {
      const deptIds = user.roles
        .filter((r) => r.role === 'department_head' && r.scopeDepartmentId !== null)
        .map((r) => r.scopeDepartmentId as number);
      where = {
        deletedAt: null,
        coursePart: {
          course: { semester: { batch: { program: { departmentId: { in: deptIds } } } } },
        },
      };
    } else {
      const teacher = await this.access.requireTeacher(user);
      where = { deletedAt: null, createdByTeacherId: teacher.id };
    }

    if (departmentPublicId) {
      const deptFilter: Prisma.ExamWhereInput = {
        coursePart: {
          course: {
            semester: {
              batch: { program: { department: { publicId: departmentPublicId } } },
            },
          },
        },
      };
      where = { AND: [where, deptFilter] };
    }
    const exams = await this.prisma.db.exam.findMany({
      where,
      select: examListSelect,
      orderBy: [{ createdAt: 'desc' }],
    });
    return exams.map((e) => {
      const course = e.coursePart.course;
      const sem = course.semester;
      const batch = sem.batch;
      return {
        publicId: e.publicId,
        title: e.title,
        courseCode: course.code,
        courseName: course.name,
        part: e.coursePart.name,
        semesterLabel: sem.name?.trim() ? sem.name : `Semester ${sem.number}`,
        semesterNumber: sem.number,
        programName: batch.program.name,
        departmentName: batch.program.department.name,
        batch: batch.name,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        durationMinutes: e.durationMinutes,
        totalMarks: e.totalMarks,
        questionCount: e._count.examQuestions,
        status: e.status,
        reviewNote: e.reviewNote,
        updatedAt: e.updatedAt.toISOString(),
        createdByName: e.createdBy.user.displayName,
      };
    });
  }

  /**
   * Conducted exams for the Results portal, each tagged with the BATCH that actually sat it
   * (derived from attempts; falls back to the batch currently sitting the semester) and whether
   * that batch is the current cohort. Lets the teacher default to the current session and filter
   * back to previous batches/semesters. Scoped like listExams (teacher=own, head=dept, admin=all).
   */
  async getMyConductedExams(user: AuthUser): Promise<TeacherConductedExam[]> {
    const CONDUCTED: ExamStatus[] = ['live', 'ended', 'grading', 'results_published'];
    let where: Prisma.ExamWhereInput;
    if (this.isAdmin(user)) {
      where = { deletedAt: null };
    } else if (user.roles.some((r) => r.role === 'department_head')) {
      const deptIds = user.roles
        .filter((r) => r.role === 'department_head' && r.scopeDepartmentId !== null)
        .map((r) => r.scopeDepartmentId as number);
      where = {
        deletedAt: null,
        coursePart: {
          course: { semester: { batch: { program: { departmentId: { in: deptIds } } } } },
        },
      };
    } else {
      const teacher = await this.access.requireTeacher(user);
      where = { deletedAt: null, createdByTeacherId: teacher.id };
    }
    where.status = { in: CONDUCTED };

    // Each semester now belongs to exactly one batch, so the exam's batch is deterministic.
    const exams = await this.prisma.db.exam.findMany({
      where,
      select: {
        publicId: true,
        title: true,
        status: true,
        startAt: true,
        totalMarks: true,
        durationMinutes: true,
        _count: { select: { attempts: true } },
        coursePart: {
          select: {
            name: true,
            course: {
              select: {
                code: true,
                name: true,
                semesterId: true,
                semester: {
                  select: {
                    number: true,
                    name: true,
                    batch: { select: { publicId: true, name: true, currentSemesterId: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ startAt: 'desc' }],
    });

    return exams.map((e) => {
      const course = e.coursePart.course;
      const sem = course.semester;
      const batch = sem.batch;
      const semLabel = sem.name?.trim() ? sem.name : `Semester ${sem.number}`;
      return {
        publicId: e.publicId,
        title: e.title,
        courseCode: course.code,
        courseName: course.name,
        part: e.coursePart.name,
        status: e.status,
        startAt: e.startAt.toISOString(),
        totalMarks: e.totalMarks,
        durationMinutes: e.durationMinutes,
        semesterNumber: sem.number,
        semesterLabel: semLabel,
        batchName: batch.name,
        batchPublicId: batch.publicId,
        // "Current" when the batch is presently sitting this exam's semester.
        isCurrentBatch: batch.currentSemesterId === course.semesterId,
        attempted: e._count.attempts,
      };
    });
  }

  /** The course parts the current teacher is assigned to — feeds the New Exam / bank pickers. */
  async listMyParts(user: AuthUser) {
    const teacher = await this.access.requireTeacher(user);
    const parts = await this.prisma.db.coursePart.findMany({
      where: { assignedTeacherId: teacher.id, deletedAt: null },
      select: {
        publicId: true,
        name: true,
        course: {
          select: {
            code: true,
            name: true,
            semester: {
              select: {
                number: true,
                name: true,
                // Batches currently sitting in this semester see this course's exams.
                batches: {
                  where: { deletedAt: null },
                  select: { name: true, year: true },
                  orderBy: { year: 'desc' },
                },
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    return parts.map((p) => {
      const batches = p.course.semester.batches;
      const semLabel = p.course.semester.name?.trim()
        ? p.course.semester.name
        : `Semester ${p.course.semester.number}`;
      return {
        publicId: p.publicId,
        partName: p.name,
        courseCode: p.course.code,
        courseTitle: p.course.name,
        semesterLabel: semLabel,
        currentBatch: batches.length ? batches.map((b) => b.name).join(', ') : null,
        label: `${p.course.code} · ${p.course.name} · ${p.name}`,
      };
    });
  }

  /**
   * Course parts the user may author into — feeds the admin/teacher Question Bank
   * and New-Exam pickers. Teachers see their assigned parts; admins/super-admins
   * see every part (faculty-scoped admins are confined to their faculty);
   * department heads see their department's parts.
   */
  async listAuthorableParts(user: AuthUser) {
    const isSuper = user.roles.some((r) => r.role === 'super_admin');
    const isAdmin = user.roles.some((r) => r.role === 'admin');
    const headDeptIds = user.roles
      .filter((r) => r.role === 'department_head' && r.scopeDepartmentId !== null)
      .map((r) => r.scopeDepartmentId as number);
    const isTeacher = user.roles.some((r) => r.role === 'teacher');

    const where: Prisma.CoursePartWhereInput = { deletedAt: null };
    if (isSuper) {
      // every part
    } else if (isAdmin) {
      const facultyIds = user.roles
        .filter((r) => r.role === 'admin' && r.scopeFacultyId !== null)
        .map((r) => r.scopeFacultyId as number);
      if (facultyIds.length) {
        where.course = {
          semester: { batch: { program: { department: { facultyId: { in: facultyIds } } } } },
        };
      }
    } else if (headDeptIds.length) {
      where.course = { semester: { batch: { program: { departmentId: { in: headDeptIds } } } } };
    } else if (isTeacher) {
      const teacher = await this.access.requireTeacher(user);
      where.assignedTeacherId = teacher.id;
    } else {
      return [];
    }

    const parts = await this.prisma.db.coursePart.findMany({
      where,
      select: {
        publicId: true,
        name: true,
        course: {
          select: {
            code: true,
            name: true,
            semester: {
              select: {
                number: true,
                name: true,
                batch: {
                  select: {
                    name: true,
                    program: {
                      select: {
                        name: true,
                        department: {
                          select: { name: true, faculty: { select: { name: true } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ course: { code: 'asc' } }, { name: 'asc' }],
    });

    return parts.map((p) => {
      const sem = p.course.semester;
      const batch = sem.batch;
      const semLabel = sem.name?.trim() ? sem.name : `Semester ${sem.number}`;
      return {
        publicId: p.publicId,
        partName: p.name,
        courseCode: p.course.code,
        courseTitle: p.course.name,
        semesterLabel: semLabel,
        semesterNumber: sem.number,
        program: batch.program.name,
        department: batch.program.department.name,
        faculty: batch.program.department.faculty.name,
        currentBatch: batch.name,
        label: `${p.course.code} · ${p.course.name} · ${p.name} (${batch.program.name} · ${batch.name} · ${semLabel})`,
      };
    });
  }

  /**
   * A marks matrix for one course part: every graded exam (columns) × every
   * enrolled student (rows), with per-student average, best, and best-two
   * average. Visible to the assigned teacher and to admins/heads in scope.
   */
  async getPartMarksMatrix(user: AuthUser, partPublicId: string) {
    const ctx = await this.access.loadActiveCoursePart(partPublicId);
    if (this.isAdmin(user) || user.roles.some((r) => r.role === 'department_head')) {
      this.access.assertAdminScope(user, ctx);
    } else {
      const teacher = await this.access.requireTeacher(user);
      if (ctx.assignedTeacherId !== teacher.id) {
        throw new ForbiddenException('You are not assigned to this course part');
      }
    }

    const part = await this.prisma.db.coursePart.findUniqueOrThrow({
      where: { id: ctx.coursePartId },
      select: {
        publicId: true,
        name: true,
        course: {
          select: {
            code: true,
            name: true,
            semesterId: true,
            semester: {
              select: {
                number: true,
                name: true,
                batches: {
                  where: { deletedAt: null },
                  select: { name: true, year: true },
                  orderBy: { year: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    // Only exams that have computed marks belong in the matrix.
    const exams = await this.prisma.db.exam.findMany({
      where: {
        coursePartId: ctx.coursePartId,
        deletedAt: null,
        status: { in: ['ended', 'grading', 'results_published'] },
      },
      select: { id: true, publicId: true, title: true, startAt: true, totalMarks: true },
      orderBy: { startAt: 'asc' },
    });

    const students = await this.prisma.db.student.findMany({
      where: { batch: { currentSemesterId: part.course.semesterId }, deletedAt: null },
      select: {
        publicId: true,
        studentId: true,
        rollNumber: true,
        user: { select: { displayName: true } },
      },
      orderBy: [{ rollNumber: 'asc' }, { studentId: 'asc' }],
    });

    const examIds = exams.map((e) => e.id);
    const results = examIds.length
      ? await this.prisma.db.examResult.findMany({
          where: { attempt: { examId: { in: examIds } } },
          select: {
            finalScore: true,
            attempt: { select: { examId: true, student: { select: { publicId: true } } } },
          },
        })
      : [];
    // (studentPublicId, examId) → finalScore
    const scoreByKey = new Map<string, number>();
    for (const r of results) {
      scoreByKey.set(`${r.attempt.student.publicId}:${r.attempt.examId}`, r.finalScore);
    }

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const hasBestTwo = exams.length > 2;

    const rows = students.map((s) => {
      const scores: Record<string, number | null> = {};
      const achieved: number[] = [];
      for (const e of exams) {
        const v = scoreByKey.get(`${s.publicId}:${e.id}`);
        const val = v ?? null;
        scores[e.publicId] = val;
        if (val != null) achieved.push(val);
      }
      const sorted = [...achieved].sort((a, b) => b - a);
      const average = achieved.length
        ? round1(achieved.reduce((a, b) => a + b, 0) / achieved.length)
        : null;
      const best = sorted.length ? sorted[0] : null;
      const topTwo = sorted.slice(0, 2);
      const bestTwoAverage = topTwo.length
        ? round1(topTwo.reduce((a, b) => a + b, 0) / topTwo.length)
        : null;
      return {
        studentPublicId: s.publicId,
        studentId: s.studentId,
        name: s.user.displayName,
        rollNumber: s.rollNumber,
        scores,
        attemptedCount: achieved.length,
        average,
        best,
        bestTwoAverage,
      };
    });

    const sem = part.course.semester;
    return {
      part: {
        publicId: part.publicId,
        courseCode: part.course.code,
        courseName: part.course.name,
        partName: part.name,
        semesterLabel: sem.name?.trim() ? sem.name : `Semester ${sem.number}`,
        batch: sem.batches.length ? sem.batches.map((b) => b.name).join(', ') : null,
      },
      exams: exams.map((e) => ({
        publicId: e.publicId,
        title: e.title,
        date: e.startAt.toISOString(),
        totalMarks: e.totalMarks,
      })),
      rows,
      hasBestTwo,
    };
  }

  async getExam(user: AuthUser, publicId: string) {
    const exam = await this.loadExam(publicId);
    await this.assertReadAccess(user, exam);
    return this.prisma.db.exam.findFirstOrThrow({ where: { publicId }, select: examSelect });
  }

  async getExamQuestions(user: AuthUser, publicId: string) {
    const exam = await this.loadExam(publicId);
    await this.assertReadAccess(user, exam);
    return this.prisma.db.examQuestion.findMany({
      where: { exam: { publicId } },
      select: examQuestionSelect,
      orderBy: { order: 'asc' },
    });
  }

  private async assertReadAccess(user: AuthUser, exam: ExamHandle): Promise<void> {
    if (this.isAdmin(user)) {
      this.access.assertAdminScope(user, exam);
      return;
    }
    // A department head may read (not act on) exams within their department scope.
    if (user.roles.some((r) => r.role === 'department_head')) {
      this.access.assertAdminScope(user, exam);
      return;
    }
    await this.assertOwner(user, exam);
  }

  /** Students who can sit this exam — those in a batch currently assigned to the exam's semester.
   *  Feeds the individual mark-sheet selector. */
  async getRoster(user: AuthUser, publicId: string) {
    const exam = await this.loadExam(publicId);
    await this.assertReadAccess(user, exam);
    const full = await this.prisma.db.exam.findFirstOrThrow({
      where: { publicId },
      select: { coursePart: { select: { course: { select: { semesterId: true } } } } },
    });
    const semesterId = full.coursePart.course.semesterId;
    const students = await this.prisma.db.student.findMany({
      where: { batch: { currentSemesterId: semesterId } },
      select: {
        publicId: true,
        studentId: true,
        user: { select: { displayName: true } },
      },
      orderBy: { studentId: 'asc' },
    });
    return students.map((s) => ({
      publicId: s.publicId,
      studentId: s.studentId,
      name: s.user.displayName,
    }));
  }

  /** Per-exam review roster: every enrolled student, whether they sat the exam,
   *  their attempt status and their mark. Powers the teacher "Results" portal. */
  async getResultsOverview(user: AuthUser, publicId: string) {
    const exam = await this.loadExam(publicId);
    await this.assertReadAccess(user, exam);
    const full = await this.prisma.db.exam.findFirstOrThrow({
      where: { publicId },
      select: {
        title: true,
        totalMarks: true,
        startAt: true,
        status: true,
        coursePart: {
          select: {
            publicId: true,
            name: true,
            course: {
              select: {
                code: true,
                name: true,
                semesterId: true,
                semester: { select: { number: true } },
              },
            },
          },
        },
      },
    });
    const semesterId = full.coursePart.course.semesterId;
    const students = await this.prisma.db.student.findMany({
      where: { batch: { currentSemesterId: semesterId } },
      select: {
        publicId: true,
        studentId: true,
        rollNumber: true,
        user: { select: { displayName: true } },
        batch: { select: { name: true } },
      },
      orderBy: { studentId: 'asc' },
    });
    const attempts = await this.prisma.db.examAttempt.findMany({
      where: { exam: { publicId } },
      select: {
        publicId: true,
        status: true,
        gradingStatus: true,
        submittedAt: true,
        proctorViolations: true,
        student: { select: { publicId: true } },
        result: { select: { finalScore: true, percentage: true, rank: true } },
      },
    });
    const byStudent = new Map(attempts.map((a) => [a.student.publicId, a]));

    const rows = students.map((s) => {
      const a = byStudent.get(s.publicId);
      return {
        studentPublicId: s.publicId,
        studentId: s.studentId,
        rollNumber: s.rollNumber,
        name: s.user.displayName,
        batchName: s.batch.name,
        attempted: Boolean(a),
        attemptStatus: a?.status ?? null,
        gradingStatus: a?.gradingStatus ?? null,
        submittedAt: a?.submittedAt?.toISOString() ?? null,
        attemptPublicId: a?.publicId ?? null,
        score: a?.result?.finalScore ?? null,
        percentage: a?.result?.percentage ?? null,
        rank: a?.result?.rank ?? null,
        proctorViolations: a?.proctorViolations ?? 0,
      };
    });

    const attemptedCount = rows.filter((r) => r.attempted).length;
    return {
      exam: {
        publicId,
        title: full.title,
        courseCode: full.coursePart.course.code,
        courseName: full.coursePart.course.name,
        partName: full.coursePart.name,
        partPublicId: full.coursePart.publicId,
        semesterNumber: full.coursePart.course.semester.number,
        totalMarks: full.totalMarks,
        startAt: full.startAt.toISOString(),
        status: full.status,
      },
      counts: {
        total: rows.length,
        attempted: attemptedCount,
        absent: rows.length - attemptedCount,
      },
      rows,
    };
  }

  async updateExam(user: AuthUser, ip: string, publicId: string, dto: UpdateExamDto) {
    const exam = await this.loadExam(publicId);
    if (this.isAdmin(user)) {
      this.access.assertAdminScope(user, exam);
      if (!ADMIN_EDITABLE_STATUSES.includes(exam.status)) {
        throw new BadRequestException(`An exam in ${exam.status} can no longer be edited`);
      }
    } else {
      await this.assertOwner(user, exam);
      if (exam.status !== 'draft') {
        throw new BadRequestException('A teacher can only edit an exam while it is a draft');
      }
    }

    const data: Prisma.ExamUpdateInput = {
      title: dto.title,
      instructions: dto.instructions,
      durationMinutes: dto.durationMinutes,
    };
    if (dto.startAt) data.startAt = new Date(dto.startAt);
    if (dto.endAt) data.endAt = new Date(dto.endAt);
    if (dto.settings) data.settings = dto.settings as unknown as Prisma.InputJsonValue;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exam.update({ where: { publicId }, data, select: examSelect });
      await this.audit.recordTx(tx, {
        actorUserId: user.id,
        action: 'exam.update',
        entity: 'Exam',
        entityId: publicId,
        after: { title: dto.title },
        ip,
      });
      return updated;
    });
  }

  async remove(user: AuthUser, ip: string, publicId: string) {
    const exam = await this.loadExam(publicId);
    if (this.isAdmin(user)) {
      this.access.assertAdminScope(user, exam);
      if (!ADMIN_EDITABLE_STATUSES.includes(exam.status)) {
        throw new BadRequestException(`An exam in ${exam.status} cannot be deleted`);
      }
    } else {
      // A teacher may delete only their OWN exam, and only while it is still theirs to change.
      await this.assertOwner(user, exam);
      if (exam.status !== 'draft' && exam.status !== 'changes_requested') {
        throw new BadRequestException('You can only delete a draft exam');
      }
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.exam.update({ where: { publicId }, data: { deletedAt: new Date() } });
      await this.audit.recordTx(tx, {
        actorUserId: user.id,
        action: 'exam.delete',
        entity: 'Exam',
        entityId: publicId,
        before: { status: exam.status },
        after: { deletedAt: new Date().toISOString() },
        ip,
      });
      return { status: 'ok' as const };
    });
  }

  // ─────────────────────────── Exam questions ───────────────────────────
  async addQuestion(user: AuthUser, ip: string, examPublicId: string, dto: AddExamQuestionDto) {
    const exam = await this.loadExam(examPublicId);
    await this.assertCanAuthorExam(user, exam);
    if (exam.status !== 'draft') {
      throw new BadRequestException('Questions can only be changed while the exam is a draft');
    }
    const q = await this.prisma.db.question.findFirst({
      where: { publicId: dto.questionPublicId },
      select: { id: true, bank: { select: { coursePart: { select: { publicId: true } } } } },
    });
    if (!q) throw new NotFoundException('Question not found');
    if (q.bank.coursePart.publicId !== exam.coursePartPublicId) {
      throw new BadRequestException('Question is not from this course part');
    }

    return this.prisma.$transaction(async (tx) => {
      const eq = await tx.examQuestion.create({
        data: {
          examId: exam.id,
          questionId: q.id,
          order: dto.order,
          marksOverride: dto.marksOverride ?? null,
        },
        select: examQuestionSelect,
      });
      await this.recomputeTotal(tx, exam.id);
      await this.audit.recordTx(tx, {
        actorUserId: user.id,
        action: 'exam.add_question',
        entity: 'Exam',
        entityId: examPublicId,
        after: { questionPublicId: dto.questionPublicId, order: dto.order },
        ip,
      });
      return eq;
    });
  }

  async removeQuestion(
    user: AuthUser,
    ip: string,
    examPublicId: string,
    examQuestionPublicId: string,
  ) {
    const exam = await this.loadExam(examPublicId);
    await this.assertCanAuthorExam(user, exam);
    if (exam.status !== 'draft') {
      throw new BadRequestException('Questions can only be changed while the exam is a draft');
    }
    return this.prisma.$transaction(async (tx) => {
      const eq = await tx.examQuestion.findFirst({
        where: { publicId: examQuestionPublicId, examId: exam.id },
        select: { id: true },
      });
      if (!eq) throw new NotFoundException('Exam question not found');
      await tx.examQuestion.delete({ where: { id: eq.id } });
      await this.recomputeTotal(tx, exam.id);
      await this.audit.recordTx(tx, {
        actorUserId: user.id,
        action: 'exam.remove_question',
        entity: 'Exam',
        entityId: examPublicId,
        after: { examQuestionPublicId },
        ip,
      });
      return { status: 'ok' as const };
    });
  }

  /** Reorder the exam's questions. `order` is the full list of examQuestion publicIds, new order. */
  async reorderQuestions(user: AuthUser, ip: string, examPublicId: string, order: string[]) {
    const exam = await this.loadExam(examPublicId);
    await this.assertCanAuthorExam(user, exam);
    if (exam.status !== 'draft') {
      throw new BadRequestException('Questions can only be reordered while the exam is a draft');
    }
    const existing = await this.prisma.db.examQuestion.findMany({
      where: { examId: exam.id },
      select: { publicId: true },
    });
    const existingIds = new Set(existing.map((e) => e.publicId));
    if (order.length !== existingIds.size || !order.every((id) => existingIds.has(id))) {
      throw new BadRequestException('The reorder list must contain exactly this exam’s questions');
    }

    await this.prisma.$transaction(async (tx) => {
      // No (examId, order) unique constraint — a single pass of 1-based positions is enough.
      await Promise.all(
        order.map((publicId, i) =>
          tx.examQuestion.update({ where: { publicId }, data: { order: i + 1 } }),
        ),
      );
      await this.audit.recordTx(tx, {
        actorUserId: user.id,
        action: 'exam.reorder_questions',
        entity: 'Exam',
        entityId: examPublicId,
        after: { order },
        ip,
      });
    });

    return this.prisma.db.examQuestion.findMany({
      where: { exam: { publicId: examPublicId } },
      select: examQuestionSelect,
      orderBy: { order: 'asc' },
    });
  }

  // ─────────────────────────── State transitions ───────────────────────────
  async submit(user: AuthUser, ip: string, publicId: string) {
    const exam = await this.loadExam(publicId);
    await this.assertCanAuthorExam(user, exam); // owning teacher or admin/head in scope
    this.assertTransition(exam.status, 'in_review'); // draft→in_review (test d rejects others)
    const count = await this.prisma.db.examQuestion.count({ where: { examId: exam.id } });
    if (count === 0) throw new BadRequestException('Add at least one question before submitting');
    return this.changeStatus(user, ip, exam, 'in_review', 'exam.submit');
  }

  async revertToDraft(user: AuthUser, ip: string, publicId: string) {
    const exam = await this.loadExam(publicId);
    await this.assertOwner(user, exam);
    this.assertTransition(exam.status, 'draft'); // only from changes_requested
    return this.changeStatus(user, ip, exam, 'draft', 'exam.revise');
  }

  async approve(user: AuthUser, ip: string, publicId: string) {
    const exam = await this.loadExam(publicId);
    this.access.assertAdminScope(user, exam);
    this.assertTransition(exam.status, 'approved');
    return this.changeStatus(user, ip, exam, 'approved', 'exam.approve');
  }

  async requestChanges(user: AuthUser, ip: string, publicId: string, note?: string) {
    const exam = await this.loadExam(publicId);
    this.access.assertAdminScope(user, exam);
    this.assertTransition(exam.status, 'changes_requested');
    return this.changeStatus(user, ip, exam, 'changes_requested', 'exam.request_changes', {
      reviewNote: note ?? null,
    });
  }

  async reject(user: AuthUser, ip: string, publicId: string, note?: string) {
    const exam = await this.loadExam(publicId);
    this.access.assertAdminScope(user, exam);
    this.assertTransition(exam.status, 'rejected');
    return this.changeStatus(user, ip, exam, 'rejected', 'exam.reject', {
      reviewNote: note ?? null,
    });
  }

  /**
   * approved → published. Snapshots each question (text/options/correct answer/marks) into its
   * ExamQuestion so later bank edits can never alter this exam. Computes totalMarks from snapshots.
   */
  async publish(user: AuthUser, ip: string, publicId: string) {
    const exam = await this.loadExam(publicId);
    this.access.assertAdminScope(user, exam);
    this.assertTransition(exam.status, 'published');
    // Re-check the course part is still live at publish time (integrity guard).
    await this.access.loadActiveCoursePart(exam.coursePartPublicId);

    const eqs = await this.prisma.db.examQuestion.findMany({
      where: { exam: { publicId } },
      select: {
        id: true,
        marksOverride: true,
        question: {
          select: {
            type: true,
            text: true,
            marks: true,
            explanation: true,
            modelAnswer: true,
            options: {
              select: { publicId: true, text: true, isCorrect: true, order: true },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });
    if (eqs.length === 0) throw new BadRequestException('Cannot publish an exam with no questions');

    let total = 0;
    const result = await this.prisma.$transaction(async (tx) => {
      for (const eq of eqs) {
        const marks = eq.marksOverride ?? eq.question.marks;
        total += marks;
        await tx.examQuestion.update({
          where: { id: eq.id },
          data: {
            snapshotAt: new Date(),
            snapshotType: eq.question.type,
            snapshotText: eq.question.text,
            snapshotMarks: marks,
            snapshotExplanation: eq.question.explanation,
            snapshotModelAnswer: eq.question.modelAnswer,
            snapshotOptions:
              eq.question.type === 'mcq'
                ? (eq.question.options.map((o) => ({
                    id: o.publicId,
                    text: o.text,
                    order: o.order,
                  })) as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            snapshotCorrectOptionId:
              eq.question.type === 'mcq'
                ? (eq.question.options.find((o) => o.isCorrect)?.publicId ?? null)
                : null,
          },
        });
      }
      const updated = await tx.exam.update({
        where: { publicId },
        data: { status: 'published', publishedAt: new Date(), totalMarks: total },
        select: examSelect,
      });
      await this.audit.recordTx(tx, {
        actorUserId: user.id,
        action: 'exam.publish',
        entity: 'Exam',
        entityId: publicId,
        before: { status: exam.status },
        after: { status: 'published', totalMarks: total },
        ip,
      });
      return updated;
    });
    return result;
  }

  // ── post-exam lifecycle (admin): ended → grading → results_published → archived ──
  async startGrading(user: AuthUser, ip: string, publicId: string) {
    const exam = await this.loadExam(publicId);
    this.access.assertAdminScope(user, exam);
    this.assertTransition(exam.status, 'grading');
    return this.changeStatus(user, ip, exam, 'grading', 'exam.start_grading');
  }

  async publishResults(user: AuthUser, ip: string, publicId: string) {
    const exam = await this.loadExam(publicId);
    this.access.assertAdminScope(user, exam);
    this.assertTransition(exam.status, 'results_published');
    return this.changeStatus(user, ip, exam, 'results_published', 'exam.publish_results');
  }

  async archive(user: AuthUser, ip: string, publicId: string) {
    const exam = await this.loadExam(publicId);
    this.access.assertAdminScope(user, exam);
    this.assertTransition(exam.status, 'archived');
    return this.changeStatus(user, ip, exam, 'archived', 'exam.archive');
  }
}
