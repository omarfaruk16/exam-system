import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';
import { AuditService } from '../audit/audit.service';
import { AttemptRedisService } from './attempt.redis';
import type { AnswerInput } from './dto/attempt.dto';
import { PaperService } from './paper.service';

const BUFFER_SEC = 2 * 60 * 60;

interface ExamSettings {
  showMarksAfterSubmit?: boolean;
  showExplanation?: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
}

@Injectable()
export class AttemptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: AttemptRedisService,
    private readonly paper: PaperService,
    private readonly audit: AuditService,
  ) {}

  private async requireStudent(
    user: AuthUser,
  ): Promise<{ id: number; currentSemesterId: number | null }> {
    const student = await this.prisma.db.student.findFirst({
      where: { userId: user.id },
      select: { id: true, batch: { select: { currentSemesterId: true } } },
    });
    if (!student) throw new ForbiddenException('Only a student can take an exam');
    return { id: student.id, currentSemesterId: student.batch.currentSemesterId };
  }

  /** The student's visible exams — those in their batch's current semester — with any attempt. */
  async listMyExams(user: AuthUser) {
    const student = await this.requireStudent(user);
    if (student.currentSemesterId === null) return [];
    const exams = await this.prisma.db.exam.findMany({
      where: {
        coursePart: { course: { semesterId: student.currentSemesterId } },
        status: { in: ['published', 'live', 'ended', 'grading', 'results_published'] },
      },
      select: {
        publicId: true,
        title: true,
        startAt: true,
        endAt: true,
        durationMinutes: true,
        totalMarks: true,
        status: true,
        settings: true,
        coursePart: {
          select: {
            name: true,
            course: { select: { code: true } },
          },
        },
        attempts: {
          where: { studentId: student.id },
          select: {
            publicId: true,
            status: true,
            gradingStatus: true,
            totalScore: true,
            submittedAt: true,
          },
          take: 1,
        },
      },
      orderBy: [{ startAt: 'desc' }],
    });
    return exams.map((e) => {
      const a = e.attempts[0];
      const settings = (e.settings as ExamSettings) ?? {};
      return {
        examPublicId: e.publicId,
        title: e.title,
        courseCode: e.coursePart.course.code,
        part: e.coursePart.name,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        durationMinutes: e.durationMinutes,
        totalMarks: e.totalMarks,
        status: e.status,
        showMarksAfterSubmit: settings.showMarksAfterSubmit !== false,
        attempt: a
          ? {
              publicId: a.publicId,
              status: a.status,
              gradingStatus: a.gradingStatus,
              totalScore: a.totalScore,
              submittedAt: a.submittedAt?.toISOString() ?? null,
            }
          : null,
      };
    });
  }

  // ─────────────────────────────── START ───────────────────────────────
  async start(user: AuthUser, examPublicId: string, ip: string | null) {
    const student = await this.requireStudent(user);
    const exam = await this.prisma.db.exam.findFirst({
      where: { publicId: examPublicId },
      select: {
        id: true,
        publicId: true,
        title: true,
        instructions: true,
        durationMinutes: true,
        totalMarks: true,
        status: true,
        startAt: true,
        endAt: true,
        settings: true,
        coursePart: { select: { course: { select: { semesterId: true } } } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    if (student.currentSemesterId !== exam.coursePart.course.semesterId) {
      throw new ForbiddenException('You are not enrolled in this exam');
    }

    // Lazy activation: if the scheduled start time has passed but the 15s sweep
    // hasn't flipped the exam yet, transition published→live on demand so the
    // student never waits for the background job. Race-safe via updateMany guard.
    const now = new Date();
    if (
      exam.status === 'published' &&
      exam.startAt.getTime() <= now.getTime() &&
      exam.endAt.getTime() > now.getTime()
    ) {
      const flipped = await this.prisma.db.exam.updateMany({
        where: { id: exam.id, status: 'published' },
        data: { status: 'live' },
      });
      if (flipped.count > 0) {
        exam.status = 'live';
        await this.audit.record({
          actorUserId: null,
          action: 'exam.auto_live',
          entity: 'Exam',
          entityId: exam.publicId,
          before: { status: 'published' },
          after: { status: 'live' },
        });
      } else {
        // Someone else flipped it concurrently — re-read the current status.
        const fresh = await this.prisma.db.exam.findUniqueOrThrow({
          where: { id: exam.id },
          select: { status: true },
        });
        exam.status = fresh.status;
      }
    }

    if (exam.status !== 'live') throw new ForbiddenException('This exam is not currently open');

    // Create or resume — the unique (examId, studentId) constraint blocks a duplicate attempt.
    let attempt = await this.prisma.db.examAttempt.findFirst({
      where: { examId: exam.id, studentId: student.id },
      select: { id: true, publicId: true, startedAt: true, status: true },
    });
    if (!attempt) {
      try {
        attempt = await this.prisma.examAttempt.create({
          data: { examId: exam.id, studentId: student.id },
          select: { id: true, publicId: true, startedAt: true, status: true },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          attempt = await this.prisma.db.examAttempt.findFirstOrThrow({
            where: { examId: exam.id, studentId: student.id },
            select: { id: true, publicId: true, startedAt: true, status: true },
          });
        } else {
          throw e;
        }
      }
    }
    if (attempt.status !== 'in_progress') {
      throw new ConflictException('You have already submitted this exam');
    }

    const ttlSec = exam.durationMinutes * 60 + BUFFER_SEC;
    // Deadline is server-authoritative: min(exam end, start + duration). Never from the client.
    const deadlineMs = Math.min(
      exam.endAt.getTime(),
      attempt.startedAt.getTime() + exam.durationMinutes * 60_000,
    );
    await this.redis.setDeadline(attempt.id, deadlineMs, ttlSec);

    // Single active session — overwriting supersedes any previous device.
    const sessionId = randomUUID();
    const previous = await this.redis.setSession(exam.id, student.id, sessionId, ttlSec);
    if (previous && previous !== sessionId) {
      await this.audit.record({
        actorUserId: user.id,
        action: 'exam.session_superseded',
        entity: 'ExamAttempt',
        entityId: attempt.publicId,
        before: { sessionId: previous },
        after: { sessionId },
        ip,
      });
    }

    const paper = await this.paper.getPaperForAttempt(
      {
        id: exam.id,
        publicId: exam.publicId,
        title: exam.title,
        instructions: exam.instructions,
        durationMinutes: exam.durationMinutes,
        totalMarks: exam.totalMarks,
        settings: (exam.settings as ExamSettings) ?? {},
      },
      attempt.publicId,
    );

    // Already-persisted answers, so a reconnect resumes where the student left off.
    const saved = await this.prisma.db.answer.findMany({
      where: { attemptId: attempt.id },
      select: {
        selectedOptionId: true,
        writtenText: true,
        question: { select: { publicId: true } },
      },
    });

    return {
      attempt: {
        publicId: attempt.publicId,
        startedAt: attempt.startedAt.toISOString(),
        deadline: new Date(deadlineMs).toISOString(),
        durationMinutes: exam.durationMinutes,
        status: attempt.status,
      },
      sessionId,
      serverTime: new Date().toISOString(),
      paper,
      savedAnswers: saved.map((a) => ({
        questionPublicId: a.question.publicId,
        selectedOptionId: a.selectedOptionId,
        writtenText: a.writtenText,
      })),
    };
  }

  // ─────────────────────────────── AUTOSAVE ───────────────────────────────
  async autosave(
    user: AuthUser,
    attemptPublicId: string,
    sessionId: string,
    answers: AnswerInput[],
  ) {
    const attempt = await this.prisma.db.examAttempt.findFirst({
      where: { publicId: attemptPublicId },
      select: {
        id: true,
        examId: true,
        studentId: true,
        status: true,
        student: { select: { userId: true } },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.student.userId !== user.id) throw new ForbiddenException('Not your attempt');
    if (attempt.status !== 'in_progress')
      throw new ConflictException('This attempt is no longer open');

    const session = await this.redis.getSession(attempt.examId, attempt.studentId);
    if (!session || session !== sessionId) throw new UnauthorizedException('SESSION_SUPERSEDED');

    const deadline = await this.redis.getDeadline(attempt.id);
    const now = Date.now();
    if (deadline !== null && now > deadline) {
      throw new ConflictException('DEADLINE_PASSED — no further answers are accepted');
    }

    const eqs = await this.prisma.db.examQuestion.findMany({
      where: { examId: attempt.examId },
      select: {
        questionId: true,
        snapshotType: true,
        snapshotOptions: true,
        question: { select: { publicId: true } },
      },
    });
    const byQ = new Map(eqs.map((e) => [e.question.publicId, e]));

    const redisEntries: Record<string, string> = {};
    let saved = 0;
    for (const ans of answers) {
      const eq = byQ.get(ans.questionPublicId);
      if (!eq) continue;

      let selectedOptionId: string | null = null;
      if (eq.snapshotType === 'mcq' && ans.selectedOptionId != null) {
        const opts = (eq.snapshotOptions as { id: string }[] | null) ?? [];
        if (!opts.some((o) => o.id === ans.selectedOptionId)) {
          throw new BadRequestException('Invalid option for this question');
        }
        selectedOptionId = ans.selectedOptionId;
      }
      const writtenText = eq.snapshotType === 'written' ? (ans.writtenText ?? null) : null;

      // UPSERT on the (attemptId, questionId) unique constraint — never select-then-insert.
      await this.prisma.answer.upsert({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId: eq.questionId } },
        create: { attemptId: attempt.id, questionId: eq.questionId, selectedOptionId, writtenText },
        update: { selectedOptionId, writtenText },
      });
      redisEntries[ans.questionPublicId] = JSON.stringify({ selectedOptionId, writtenText });
      saved++;
    }

    const snapTtl =
      deadline !== null
        ? Math.max(60, Math.ceil((deadline - now) / 1000) + BUFFER_SEC)
        : 3 * 60 * 60;
    await this.redis.saveAnswerSnapshot(attempt.id, redisEntries, snapTtl);

    return { saved, serverTime: new Date().toISOString() };
  }

  // ─────────────────────────────── RESULT ───────────────────────────────
  async getResult(user: AuthUser, attemptPublicId: string) {
    const attempt = await this.prisma.db.examAttempt.findFirst({
      where: { publicId: attemptPublicId },
      select: {
        publicId: true,
        status: true,
        gradingStatus: true,
        totalScore: true,
        autoSubmitted: true,
        submittedAt: true,
        examId: true,
        student: { select: { userId: true, publicId: true } },
        exam: { select: { publicId: true, status: true, settings: true, totalMarks: true } },
        result: { select: { finalScore: true, percentage: true, rank: true } },
        answers: {
          select: {
            questionId: true,
            selectedOptionId: true,
            writtenText: true,
            autoScore: true,
            manualScore: true,
            isGraded: true,
            feedback: true,
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    const isOwner = attempt.student.userId === user.id;
    const isStaff = user.roles.some((r) => ['admin', 'super_admin', 'teacher'].includes(r.role));
    if (!isOwner && !isStaff) throw new ForbiddenException('Not your result');

    const settings = (attempt.exam.settings as ExamSettings) ?? {};
    // When showMarksAfterSubmit=false and results are not yet published, return a
    // holding response (showMarks=false) rather than a 403 — the frontend shows Mode B.
    const showMarks =
      !isOwner ||
      settings.showMarksAfterSubmit !== false ||
      attempt.exam.status === 'results_published';

    const baseFields = {
      attemptPublicId: attempt.publicId,
      status: attempt.status,
      gradingStatus: attempt.gradingStatus,
      autoSubmitted: attempt.autoSubmitted,
      submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
    };

    // Return literal-typed showMarks so the union is discriminated by TypeScript callers.
    if (!showMarks) return { ...baseFields, showMarks: false as const };

    const eqs = await this.prisma.db.examQuestion.findMany({
      where: { examId: attempt.examId },
      select: {
        questionId: true,
        order: true,
        snapshotType: true,
        snapshotText: true,
        snapshotMarks: true,
        snapshotExplanation: true,
        snapshotCorrectOptionId: true,
        snapshotOptions: true,
        question: { select: { publicId: true } },
      },
      orderBy: { order: 'asc' },
    });
    const answerByQ = new Map(attempt.answers.map((a) => [a.questionId, a]));

    type SnapshotOption = { id: string; text: string; order: number };

    const questions = eqs.map((eq) => {
      const a = answerByQ.get(eq.questionId);
      const opts = (eq.snapshotOptions ?? []) as SnapshotOption[];
      const score = a
        ? a.isGraded
          ? (a.autoScore ?? 0) + (a.manualScore ?? 0)
          : (a.autoScore ?? null)
        : null;
      return {
        questionPublicId: eq.question.publicId,
        order: eq.order,
        type: eq.snapshotType,
        snapshotText: eq.snapshotText ?? null,
        snapshotOptions: eq.snapshotType === 'mcq' ? opts : null,
        marks: eq.snapshotMarks,
        score,
        selectedOptionId: a?.selectedOptionId ?? null,
        writtenText: a?.writtenText ?? null,
        correctOptionId: eq.snapshotType === 'mcq' ? eq.snapshotCorrectOptionId : null,
        explanation: settings.showExplanation ? (eq.snapshotExplanation ?? null) : null,
        feedback: a?.feedback ?? null,
      };
    });

    const totalStudents = await this.prisma.db.examResult.count({
      where: { attempt: { examId: attempt.examId } },
    });

    return {
      ...baseFields,
      showMarks: true as const,
      examPublicId: attempt.exam.publicId,
      totalScore: attempt.totalScore,
      totalMarks: attempt.exam.totalMarks,
      percentage: attempt.result?.percentage ?? null,
      rank: attempt.result?.rank ?? null,
      totalStudents,
      myStudentPublicId: isOwner ? attempt.student.publicId : null,
      questions,
    };
  }

  /** All completed attempts for the student, grouped by semester (for the results history page). */
  async getMyResults(user: AuthUser) {
    const student = await this.prisma.db.student.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!student) return [];

    const attempts = await this.prisma.db.examAttempt.findMany({
      where: {
        studentId: student.id,
        status: { in: ['submitted', 'graded'] },
      },
      select: {
        publicId: true,
        totalScore: true,
        submittedAt: true,
        gradingStatus: true,
        exam: {
          select: {
            publicId: true,
            title: true,
            totalMarks: true,
            startAt: true,
            status: true,
            settings: true,
            coursePart: {
              select: {
                name: true,
                course: {
                  select: {
                    code: true,
                    name: true,
                    semester: {
                      select: {
                        number: true,
                        name: true,
                        program: { select: { name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        result: { select: { percentage: true, rank: true, finalScore: true } },
      },
    });

    attempts.sort((a, b) => {
      const na = a.exam.coursePart.course.semester.number;
      const nb = b.exam.coursePart.course.semester.number;
      if (na !== nb) return na - nb;
      return new Date(a.exam.startAt).getTime() - new Date(b.exam.startAt).getTime();
    });

    const semMap = new Map<
      number,
      { number: number; name: string | null; programName: string; exams: typeof attempts }
    >();
    for (const a of attempts) {
      const sem = a.exam.coursePart.course.semester;
      if (!semMap.has(sem.number)) {
        semMap.set(sem.number, {
          number: sem.number,
          name: sem.name,
          programName: sem.program.name,
          exams: [],
        });
      }
      semMap.get(sem.number)!.exams.push(a);
    }

    return [...semMap.values()].map((g) => ({
      semester: { number: g.number, name: g.name },
      programName: g.programName,
      exams: g.exams.map((a) => {
        const settings = (a.exam.settings as ExamSettings) ?? {};
        return {
          attemptPublicId: a.publicId,
          examPublicId: a.exam.publicId,
          title: a.exam.title,
          courseCode: a.exam.coursePart.course.code,
          courseName: a.exam.coursePart.course.name,
          partName: a.exam.coursePart.name,
          totalMarks: a.exam.totalMarks,
          startAt: a.exam.startAt.toISOString(),
          examStatus: a.exam.status,
          gradingStatus: a.gradingStatus,
          submittedAt: a.submittedAt?.toISOString() ?? null,
          score: a.result?.finalScore ?? a.totalScore,
          percentage: a.result?.percentage ?? null,
          rank: a.result?.rank ?? null,
          showMarks: settings.showMarksAfterSubmit !== false,
        };
      }),
    }));
  }

  /** The student's current semester info + all courses in it. */
  async getMyCourses(user: AuthUser) {
    const student = await this.prisma.db.student.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: {
        id: true,
        batch: {
          select: {
            name: true,
            currentSemesterId: true,
            currentSemester: {
              select: {
                id: true,
                number: true,
                name: true,
                program: { select: { name: true } },
                courses: {
                  where: { deletedAt: null },
                  select: {
                    publicId: true,
                    code: true,
                    name: true,
                    parts: {
                      where: { deletedAt: null },
                      select: { publicId: true, name: true },
                      orderBy: { createdAt: 'asc' },
                    },
                  },
                  orderBy: { code: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!student) return { enrolled: false, semester: null, batchName: null, courses: [] };

    const batch = student.batch;
    if (!batch.currentSemester) {
      return { enrolled: true, semester: null, batchName: batch.name, courses: [] };
    }

    const sem = batch.currentSemester;
    return {
      enrolled: true,
      batchName: batch.name,
      semester: {
        number: sem.number,
        name: sem.name ?? `Semester ${sem.number}`,
        programName: sem.program.name,
      },
      courses: sem.courses.map((c) => ({
        publicId: c.publicId,
        code: c.code,
        name: c.name,
        parts: c.parts,
      })),
    };
  }

  /**
   * The student's full academic history (transcript): their programme + every exam they
   * attempted, grouped Semester → Course → Exam, with the marks they are allowed to see.
   * Reads ExamAttempt by studentId (indexed) joined up the hierarchy — one query set.
   */
  async getMyAcademicHistory(user: AuthUser) {
    const student = await this.prisma.db.student.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: {
        id: true,
        publicId: true,
        studentId: true,
        rollNumber: true,
        registrationNumber: true,
        user: { select: { displayName: true } },
        batch: {
          select: {
            name: true,
            year: true,
            program: {
              select: {
                name: true,
                department: { select: { name: true, faculty: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });
    if (!student) {
      return { enrolled: false as const, student: null, program: null, semesters: [] };
    }

    const attempts = await this.prisma.db.examAttempt.findMany({
      where: { studentId: student.id },
      select: {
        status: true,
        submittedAt: true,
        exam: {
          select: {
            publicId: true,
            title: true,
            startAt: true,
            totalMarks: true,
            status: true,
            settings: true,
            coursePart: {
              select: {
                name: true,
                course: {
                  select: {
                    code: true,
                    name: true,
                    semester: { select: { number: true, name: true } },
                  },
                },
              },
            },
          },
        },
        result: { select: { finalScore: true, percentage: true, rank: true } },
      },
      orderBy: { exam: { startAt: 'desc' } },
    });

    const POST_EXAM = ['ended', 'grading', 'results_published'];
    // Group Semester → Course → exams.
    interface ExamRow {
      publicId: string;
      title: string;
      part: string;
      date: string;
      status: string;
      totalMarks: number;
      score: number | null;
      percentage: number | null;
      rank: number | null;
      attended: boolean;
    }
    interface CourseGroup {
      code: string;
      name: string;
      exams: ExamRow[];
    }
    interface SemGroup {
      key: string;
      number: number;
      label: string;
      courses: Map<string, CourseGroup>;
    }
    const sems = new Map<string, SemGroup>();

    for (const a of attempts) {
      const ex = a.exam;
      const sem = ex.coursePart.course.semester;
      const semLabel = sem.name?.trim() ? sem.name : `Semester ${sem.number}`;
      const semKey = `${sem.number}::${semLabel}`;
      let sg = sems.get(semKey);
      if (!sg) {
        sg = { key: semKey, number: sem.number, label: semLabel, courses: new Map() };
        sems.set(semKey, sg);
      }
      const courseKey = ex.coursePart.course.code;
      let cg = sg.courses.get(courseKey);
      if (!cg) {
        cg = { code: ex.coursePart.course.code, name: ex.coursePart.course.name, exams: [] };
        sg.courses.set(courseKey, cg);
      }
      // Marks are visible once the exam is over and (unless withheld) released to the student.
      const settings = (ex.settings as { showMarksAfterSubmit?: boolean } | null) ?? {};
      const marksVisible =
        POST_EXAM.includes(ex.status) &&
        (settings.showMarksAfterSubmit !== false || ex.status === 'results_published');
      cg.exams.push({
        publicId: ex.publicId,
        title: ex.title,
        part: ex.coursePart.name,
        date: ex.startAt.toISOString(),
        status: ex.status,
        totalMarks: ex.totalMarks,
        score: marksVisible ? (a.result?.finalScore ?? null) : null,
        percentage: marksVisible ? (a.result?.percentage ?? null) : null,
        rank: marksVisible ? (a.result?.rank ?? null) : null,
        attended: a.status !== 'in_progress' || Boolean(a.submittedAt),
      });
    }

    const semesters = [...sems.values()]
      .sort((a, b) => a.number - b.number)
      .map((sg) => ({
        number: sg.number,
        label: sg.label,
        courses: [...sg.courses.values()].sort((a, b) => a.code.localeCompare(b.code)),
      }));

    const prog = student.batch.program;
    return {
      enrolled: true as const,
      student: {
        name: student.user.displayName,
        studentId: student.studentId,
        rollNumber: student.rollNumber,
        registrationNumber: student.registrationNumber,
      },
      program: {
        name: prog.name,
        department: prog.department.name,
        faculty: prog.department.faculty.name,
        batch: student.batch.name,
        year: student.batch.year,
      },
      semesters,
    };
  }
}
