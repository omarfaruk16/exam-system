import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AccessControlService } from '../../common/access/access-control.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import type {
  AssignBatchSemesterDto,
  AssignTeacherDto,
  ChangeStudentBatchDto,
  CreateBatchDto,
  CreateCourseDto,
  CreateCoursePartDto,
  CreateDepartmentDto,
  CreateFacultyDto,
  CreateProgramDto,
  CreateSemesterDto,
  UpdateSemesterDto,
  CreateStudentManualDto,
  CreateTeacherManualDto,
  UpdateBatchDto,
  UpdateStudentDto,
  UpdateCourseDto,
  UpdateCoursePartDto,
  UpdateDepartmentDto,
  UpdateFacultyDto,
  UpdateProgramDto,
  UpdateTeacherDto,
} from './dto/structure.dto';
import {
  batchSelect,
  coursePartSelect,
  courseSelect,
  departmentSelect,
  facultySelect,
  programSelect,
  semesterSelect,
  studentSelect,
  teacherAdminSelect,
  teacherOptionSelect,
} from './org.select';

/** Mutation context threaded from the controller for the audit trail. */
export interface OrgContext {
  actor: AuthUser;
  ip?: string | null;
}

/** Download format for the structure/teacher/student exports. */
export type ExportFormat = 'xlsx' | 'csv';

/** Initial password for a newly created/imported teacher (they must change it on first login). */
export const TEACHER_DEFAULT_PASSWORD = 'Teacher@12345';

@Injectable()
export class StructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly acl: AccessControlService,
    private readonly password: PasswordService,
  ) {}

  // ─────────────────────────── parent / scope resolvers ───────────────────────────

  private async facultyRef(publicId: string): Promise<{ id: number; facultyId: number }> {
    const f = await this.prisma.db.faculty.findFirst({ where: { publicId }, select: { id: true } });
    if (!f) throw new NotFoundException('Faculty not found');
    return { id: f.id, facultyId: f.id };
  }

  private async departmentRef(publicId: string): Promise<{ id: number; facultyId: number }> {
    const d = await this.prisma.db.department.findFirst({
      where: { publicId },
      select: { id: true, facultyId: true },
    });
    if (!d) throw new NotFoundException('Department not found');
    return d;
  }

  private async programRef(
    publicId: string,
  ): Promise<{ id: number; facultyId: number; departmentId: number }> {
    const p = await this.prisma.db.program.findFirst({
      where: { publicId },
      select: { id: true, departmentId: true, department: { select: { facultyId: true } } },
    });
    if (!p) throw new NotFoundException('Program not found');
    return { id: p.id, facultyId: p.department.facultyId, departmentId: p.departmentId };
  }

  private async semesterRef(
    publicId: string,
  ): Promise<{ id: number; facultyId: number; batchId: number }> {
    const s = await this.prisma.db.semester.findFirst({
      where: { publicId },
      select: {
        id: true,
        batchId: true,
        batch: { select: { program: { select: { department: { select: { facultyId: true } } } } } },
      },
    });
    if (!s) throw new NotFoundException('Semester not found');
    return { id: s.id, facultyId: s.batch.program.department.facultyId, batchId: s.batchId };
  }

  private async courseRef(publicId: string): Promise<{ id: number; facultyId: number }> {
    const c = await this.prisma.db.course.findFirst({
      where: { publicId },
      select: {
        id: true,
        semester: {
          select: {
            batch: {
              select: { program: { select: { department: { select: { facultyId: true } } } } },
            },
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Course not found');
    return { id: c.id, facultyId: c.semester.batch.program.department.facultyId };
  }

  private async coursePartScope(
    publicId: string,
  ): Promise<{ id: number; facultyId: number; departmentId: number }> {
    const cp = await this.prisma.db.coursePart.findFirst({
      where: { publicId },
      select: {
        id: true,
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
    });
    if (!cp) throw new NotFoundException('Course part not found');
    const program = cp.course.semester.batch.program;
    return {
      id: cp.id,
      facultyId: program.department.facultyId,
      departmentId: program.departmentId,
    };
  }

  /**
   * If a soft-deleted User with this username exists, mangle its username/email so the slot
   * is freed. Allows re-adding a record after accidental deletion.
   */
  private async freeDeletedUserSlot(username: string): Promise<void> {
    const deleted = await this.prisma.user.findFirst({
      where: { username, deletedAt: { not: null } },
      select: { id: true },
    });
    if (deleted) {
      const del = `__del_${Date.now()}`;
      await this.prisma.user.update({
        where: { id: deleted.id },
        data: { username: `${username}${del}`, email: null },
      });
    }
  }

  /**
   * If a soft-deleted Student with this studentId exists, mangle its studentId/registrationNumber
   * so the unique slot is freed for re-use.
   */
  private async freeDeletedStudentSlot(studentId: string): Promise<void> {
    const deleted = await this.prisma.student.findFirst({
      where: { studentId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (deleted) {
      const del = `__del_${Date.now()}`;
      await this.prisma.student.update({
        where: { id: deleted.id },
        data: { studentId: `${studentId}${del}`, registrationNumber: null },
      });
    }
  }

  /**
   * If a soft-deleted Course with this code exists in the given semester, mangle its code
   * so the (semesterId, code) unique slot is freed for re-use.
   */
  private async freeDeletedCourseSlot(semesterId: number, code: string): Promise<void> {
    const deleted = await this.prisma.course.findFirst({
      where: { semesterId, code, deletedAt: { not: null } },
      select: { id: true },
    });
    if (deleted) {
      const del = `__del_${Date.now()}`;
      await this.prisma.course.update({
        where: { id: deleted.id },
        data: { code: `${code}${del}` },
      });
    }
  }

  /** Wrap a write + its audit row in one transaction so they commit together. */
  private async mutate<T>(
    ctx: OrgContext,
    action: string,
    entity: string,
    fn: (
      tx: Prisma.TransactionClient,
    ) => Promise<{ result: T; entityId: string; before?: unknown; after?: unknown }>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const { result, entityId, before, after } = await fn(tx);
      await this.audit.recordTx(tx, {
        actorUserId: ctx.actor.id,
        action,
        entity,
        entityId,
        before,
        after,
        ip: ctx.ip ?? null,
      });
      return result;
    });
  }

  // ─────────────────────────────── Faculty ───────────────────────────────
  /**
   * The department a NON-admin actor is confined to. Admins/super_admins return null (unscoped).
   * A department_head returns their department id; anyone else is rejected. Lets a department head
   * read only their own department's structure, students and faculty.
   */
  private deptScopeId(actor: AuthUser): number | null {
    const isAdmin = actor.roles.some((r) => r.role === 'admin' || r.role === 'super_admin');
    if (isAdmin) return null;
    const dh = actor.roles.find((r) => r.role === 'department_head' && r.scopeDepartmentId != null);
    if (!dh || dh.scopeDepartmentId == null) {
      throw new ForbiddenException('You are not assigned to a department');
    }
    return dh.scopeDepartmentId;
  }

  listFaculties(actor: AuthUser) {
    const scope = this.deptScopeId(actor);
    return this.prisma.db.faculty.findMany({
      where: scope != null ? { departments: { some: { id: scope } } } : {},
      select: facultySelect,
      orderBy: { name: 'asc' },
    });
  }
  async getFaculty(publicId: string) {
    const row = await this.prisma.db.faculty.findFirst({
      where: { publicId },
      select: facultySelect,
    });
    if (!row) throw new NotFoundException('Faculty not found');
    return row;
  }

  async getFacultyStats(publicId: string) {
    const faculty = await this.prisma.db.faculty.findFirst({
      where: { publicId, deletedAt: null },
      select: {
        publicId: true,
        name: true,
        createdAt: true,
        departments: {
          where: { deletedAt: null },
          select: {
            publicId: true,
            name: true,
            _count: { select: { programs: { where: { deletedAt: null } } } },
            teachers: { where: { deletedAt: null }, select: { id: true } },
            programs: {
              where: { deletedAt: null },
              select: {
                batches: {
                  where: { deletedAt: null },
                  select: { _count: { select: { students: { where: { deletedAt: null } } } } },
                },
              },
            },
          },
        },
      },
    });
    if (!faculty) throw new NotFoundException('Faculty not found');

    let totalPrograms = 0;
    let totalStudents = 0;
    let totalTeachers = 0;
    for (const d of faculty.departments) {
      totalPrograms += d._count.programs;
      totalTeachers += d.teachers.length;
      for (const p of d.programs) {
        for (const b of p.batches) totalStudents += b._count.students;
      }
    }

    return {
      publicId: faculty.publicId,
      name: faculty.name,
      createdAt: faculty.createdAt,
      departments: faculty.departments.map((d) => ({
        publicId: d.publicId,
        name: d.name,
        programCount: d._count.programs,
      })),
      stats: {
        departmentCount: faculty.departments.length,
        programCount: totalPrograms,
        studentCount: totalStudents,
        teacherCount: totalTeachers,
      },
    };
  }
  createFaculty(ctx: OrgContext, dto: CreateFacultyDto) {
    return this.mutate(ctx, 'faculty.create', 'Faculty', async (tx) => {
      const result = await tx.faculty.create({ data: { name: dto.name }, select: facultySelect });
      return { result, entityId: result.publicId, after: result };
    });
  }
  async updateFaculty(ctx: OrgContext, publicId: string, dto: UpdateFacultyDto) {
    const ref = await this.facultyRef(publicId);
    this.acl.assertFaculty(ctx.actor, ref.facultyId);
    const before = await this.getFaculty(publicId);
    return this.mutate(ctx, 'faculty.update', 'Faculty', async (tx) => {
      const result = await tx.faculty.update({
        where: { publicId },
        data: dto,
        select: facultySelect,
      });
      return { result, entityId: publicId, before, after: result };
    });
  }
  async removeFaculty(ctx: OrgContext, publicId: string) {
    const ref = await this.facultyRef(publicId);
    this.acl.assertFaculty(ctx.actor, ref.facultyId);
    return this.mutate(ctx, 'faculty.delete', 'Faculty', async (tx) => {
      const result = await tx.faculty.update({
        where: { publicId },
        data: { deletedAt: new Date() },
        select: facultySelect,
      });
      return { result, entityId: publicId, after: { deletedAt: new Date() } };
    });
  }

  // ─────────────────────────────── Department ───────────────────────────────
  listDepartments(actor: AuthUser, facultyPublicId?: string) {
    const scope = this.deptScopeId(actor);
    const where: Prisma.DepartmentWhereInput = {};
    if (facultyPublicId) where.faculty = { publicId: facultyPublicId };
    if (scope != null) where.id = scope;
    return this.prisma.db.department.findMany({
      where,
      select: departmentSelect,
      orderBy: { name: 'asc' },
    });
  }
  async getDepartment(publicId: string) {
    const row = await this.prisma.db.department.findFirst({
      where: { publicId },
      select: departmentSelect,
    });
    if (!row) throw new NotFoundException('Department not found');
    return row;
  }
  async createDepartment(ctx: OrgContext, dto: CreateDepartmentDto) {
    const faculty = await this.facultyRef(dto.facultyPublicId);
    this.acl.assertFaculty(ctx.actor, faculty.facultyId);
    return this.mutate(ctx, 'department.create', 'Department', async (tx) => {
      const result = await tx.department.create({
        data: { facultyId: faculty.id, name: dto.name },
        select: departmentSelect,
      });
      return { result, entityId: result.publicId, after: result };
    });
  }
  async updateDepartment(ctx: OrgContext, publicId: string, dto: UpdateDepartmentDto) {
    const ref = await this.departmentRef(publicId);
    this.acl.assertFaculty(ctx.actor, ref.facultyId);
    const before = await this.getDepartment(publicId);
    return this.mutate(ctx, 'department.update', 'Department', async (tx) => {
      const result = await tx.department.update({
        where: { publicId },
        data: dto,
        select: departmentSelect,
      });
      return { result, entityId: publicId, before, after: result };
    });
  }
  async removeDepartment(ctx: OrgContext, publicId: string) {
    const ref = await this.departmentRef(publicId);
    this.acl.assertFaculty(ctx.actor, ref.facultyId);
    return this.mutate(ctx, 'department.delete', 'Department', async (tx) => {
      const result = await tx.department.update({
        where: { publicId },
        data: { deletedAt: new Date() },
        select: departmentSelect,
      });
      return { result, entityId: publicId, after: { deletedAt: new Date() } };
    });
  }

  // ─────────────────────────────── Program ───────────────────────────────
  listPrograms(actor: AuthUser, departmentPublicId?: string) {
    const scope = this.deptScopeId(actor);
    const department: Prisma.DepartmentWhereInput = {};
    if (departmentPublicId) department.publicId = departmentPublicId;
    if (scope != null) department.id = scope;
    const where: Prisma.ProgramWhereInput = Object.keys(department).length ? { department } : {};
    return this.prisma.db.program.findMany({
      where,
      select: programSelect,
      orderBy: { name: 'asc' },
    });
  }
  async createProgram(ctx: OrgContext, dto: CreateProgramDto) {
    const dept = await this.departmentRef(dto.departmentPublicId);
    this.acl.assertFaculty(ctx.actor, dept.facultyId);
    return this.mutate(ctx, 'program.create', 'Program', async (tx) => {
      const result = await tx.program.create({
        data: {
          departmentId: dept.id,
          name: dto.name,
          degreeType: dto.degreeType,
          durationYears: dto.durationYears,
        },
        select: programSelect,
      });
      return { result, entityId: result.publicId, after: result };
    });
  }
  async updateProgram(ctx: OrgContext, publicId: string, dto: UpdateProgramDto) {
    const ref = await this.programRef(publicId);
    this.acl.assertFaculty(ctx.actor, ref.facultyId);
    return this.mutate(ctx, 'program.update', 'Program', async (tx) => {
      const result = await tx.program.update({
        where: { publicId },
        data: dto,
        select: programSelect,
      });
      return { result, entityId: publicId, after: result };
    });
  }
  async removeProgram(ctx: OrgContext, publicId: string) {
    const ref = await this.programRef(publicId);
    this.acl.assertFaculty(ctx.actor, ref.facultyId);
    return this.mutate(ctx, 'program.delete', 'Program', async (tx) => {
      const result = await tx.program.update({
        where: { publicId },
        data: { deletedAt: new Date() },
        select: programSelect,
      });
      return { result, entityId: publicId, after: { deletedAt: new Date() } };
    });
  }

  // ─────────────────────────────── Semester ───────────────────────────────
  listSemesters(actor: AuthUser, batchPublicId?: string) {
    const scope = this.deptScopeId(actor);
    const batch: Prisma.BatchWhereInput = {};
    if (batchPublicId) batch.publicId = batchPublicId;
    if (scope != null) batch.program = { department: { id: scope } };
    const where: Prisma.SemesterWhereInput = Object.keys(batch).length ? { batch } : {};
    return this.prisma.db.semester.findMany({
      where,
      select: semesterSelect,
      orderBy: { number: 'asc' },
    });
  }
  async createSemester(ctx: OrgContext, dto: CreateSemesterDto) {
    const batch = await this.batchRef(dto.batchPublicId);
    this.acl.assertFaculty(ctx.actor, batch.facultyId);
    return this.mutate(ctx, 'semester.create', 'Semester', async (tx) => {
      // The tx runs on the base client, so max() sees soft-deleted rows too — this
      // keeps the auto-assigned ordinal clear of the [batchId, number] unique slot.
      let number = dto.number;
      if (number == null) {
        const max = await tx.semester.aggregate({
          where: { batchId: batch.id },
          _max: { number: true },
        });
        number = (max._max.number ?? 0) + 1;
      }
      const result = await tx.semester.create({
        data: { batchId: batch.id, number, name: dto.name.trim() },
        select: semesterSelect,
      });
      return { result, entityId: result.publicId, after: result };
    });
  }

  async updateSemester(ctx: OrgContext, publicId: string, dto: UpdateSemesterDto) {
    const sem = await this.prisma.db.semester.findFirst({
      where: { publicId },
      select: {
        batch: { select: { program: { select: { department: { select: { facultyId: true } } } } } },
      },
    });
    if (!sem) throw new NotFoundException('Semester not found');
    this.acl.assertFaculty(ctx.actor, sem.batch.program.department.facultyId);
    return this.mutate(ctx, 'semester.update', 'Semester', async (tx) => {
      const result = await tx.semester.update({
        where: { publicId },
        data: { name: dto.name?.trim() },
        select: semesterSelect,
      });
      return { result, entityId: publicId, after: result };
    });
  }
  async removeSemester(ctx: OrgContext, publicId: string) {
    const ref = await this.semesterRef(publicId);
    this.acl.assertFaculty(ctx.actor, ref.facultyId);
    return this.mutate(ctx, 'semester.delete', 'Semester', async (tx) => {
      const result = await tx.semester.update({
        where: { publicId },
        data: { deletedAt: new Date() },
        select: semesterSelect,
      });
      return { result, entityId: publicId, after: { deletedAt: new Date() } };
    });
  }

  // ─────────────────────────────── Course ───────────────────────────────
  listCourses(actor: AuthUser, semesterPublicId?: string) {
    const scope = this.deptScopeId(actor);
    const semester: Prisma.SemesterWhereInput = {};
    if (semesterPublicId) semester.publicId = semesterPublicId;
    if (scope != null) semester.batch = { program: { department: { id: scope } } };
    const where: Prisma.CourseWhereInput = Object.keys(semester).length ? { semester } : {};
    return this.prisma.db.course.findMany({
      where,
      select: courseSelect,
      // First-created first (the order they were added), not alphabetical.
      orderBy: { createdAt: 'asc' },
    });
  }
  async createCourse(ctx: OrgContext, dto: CreateCourseDto) {
    const semester = await this.semesterRef(dto.semesterPublicId);
    this.acl.assertFaculty(ctx.actor, semester.facultyId);
    await this.freeDeletedCourseSlot(semester.id, dto.code);
    return this.mutate(ctx, 'course.create', 'Course', async (tx) => {
      const result = await tx.course.create({
        data: { semesterId: semester.id, code: dto.code, name: dto.name, credit: dto.credit },
        select: courseSelect,
      });
      return { result, entityId: result.publicId, after: result };
    });
  }
  async updateCourse(ctx: OrgContext, publicId: string, dto: UpdateCourseDto) {
    const ref = await this.courseRef(publicId);
    this.acl.assertFaculty(ctx.actor, ref.facultyId);
    return this.mutate(ctx, 'course.update', 'Course', async (tx) => {
      const result = await tx.course.update({
        where: { publicId },
        data: dto,
        select: courseSelect,
      });
      return { result, entityId: publicId, after: result };
    });
  }
  async removeCourse(ctx: OrgContext, publicId: string) {
    const course = await this.prisma.db.course.findFirst({
      where: { publicId },
      select: {
        code: true,
        semester: {
          select: {
            batch: {
              select: { program: { select: { department: { select: { facultyId: true } } } } },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    this.acl.assertFaculty(ctx.actor, course.semester.batch.program.department.facultyId);

    const del = `__del_${Date.now()}`;
    return this.mutate(ctx, 'course.delete', 'Course', async (tx) => {
      const result = await tx.course.update({
        where: { publicId },
        data: { deletedAt: new Date(), code: `${course.code}${del}` },
        select: courseSelect,
      });
      return { result, entityId: publicId, after: { deletedAt: new Date() } };
    });
  }

  // ─────────────────────────────── Course part ───────────────────────────────
  listCourseParts(coursePublicId?: string) {
    return this.prisma.db.coursePart.findMany({
      where: coursePublicId ? { course: { publicId: coursePublicId } } : {},
      select: coursePartSelect,
      orderBy: { name: 'asc' },
    });
  }
  async createCoursePart(ctx: OrgContext, dto: CreateCoursePartDto) {
    const course = await this.courseRef(dto.coursePublicId);
    this.acl.assertFaculty(ctx.actor, course.facultyId);
    return this.mutate(ctx, 'coursePart.create', 'CoursePart', async (tx) => {
      const result = await tx.coursePart.create({
        data: { courseId: course.id, name: dto.name, marksWeight: dto.marksWeight },
        select: coursePartSelect,
      });
      return { result, entityId: result.publicId, after: result };
    });
  }
  async updateCoursePart(ctx: OrgContext, publicId: string, dto: UpdateCoursePartDto) {
    const ref = await this.coursePartScope(publicId);
    this.acl.assertFaculty(ctx.actor, ref.facultyId);
    return this.mutate(ctx, 'coursePart.update', 'CoursePart', async (tx) => {
      const result = await tx.coursePart.update({
        where: { publicId },
        data: dto,
        select: coursePartSelect,
      });
      return { result, entityId: publicId, after: result };
    });
  }
  async removeCoursePart(ctx: OrgContext, publicId: string) {
    const ref = await this.coursePartScope(publicId);
    this.acl.assertFaculty(ctx.actor, ref.facultyId);
    return this.mutate(ctx, 'coursePart.delete', 'CoursePart', async (tx) => {
      const result = await tx.coursePart.update({
        where: { publicId },
        data: { deletedAt: new Date() },
        select: coursePartSelect,
      });
      return { result, entityId: publicId, after: { deletedAt: new Date() } };
    });
  }

  /** Assign or clear the single teacher of a course part. */
  async assignTeacher(ctx: OrgContext, coursePartPublicId: string, dto: AssignTeacherDto) {
    const part = await this.coursePartScope(coursePartPublicId);
    this.acl.assertDepartment(ctx.actor, part.departmentId, part.facultyId);

    let teacherId: number | null = null;
    if (dto.teacherPublicId) {
      // Any teacher may be assigned to any part — a course part can be taught by a teacher
      // from another department (e.g. a shared/borrowed course). Authorization is on the
      // PART's department (checked above via assertDepartment), not the teacher's.
      const teacher = await this.prisma.db.teacher.findFirst({
        where: { publicId: dto.teacherPublicId, deletedAt: null },
        select: { id: true },
      });
      if (!teacher) throw new NotFoundException('Teacher not found');
      teacherId = teacher.id;
    }

    return this.mutate(ctx, 'coursePart.assignTeacher', 'CoursePart', async (tx) => {
      const result = await tx.coursePart.update({
        where: { publicId: coursePartPublicId },
        data: { assignedTeacherId: teacherId },
        select: coursePartSelect,
      });
      return { result, entityId: coursePartPublicId, after: { teacherId } };
    });
  }

  // ─────────────────────────────── Teachers ───────────────────────────────

  /**
   * Selector list for the assign-teacher dropdown. Returns ALL teachers across every
   * department (each tagged with its department) so a course part can be assigned a teacher
   * from another department. The `departmentPublicId` is the part's own department and is used
   * only to authorize the caller — it does not filter the returned list.
   */
  async listTeachers(actor: AuthUser, departmentPublicId: string) {
    const dept = await this.departmentRef(departmentPublicId);
    this.acl.assertDepartment(actor, dept.id, dept.facultyId);
    const teachers = await this.prisma.db.teacher.findMany({
      where: { deletedAt: null },
      select: teacherOptionSelect,
      orderBy: [{ department: { name: 'asc' } }, { user: { displayName: 'asc' } }],
    });
    return teachers.map((t) => ({
      publicId: t.publicId,
      displayName: t.user.displayName,
      email: t.user.email,
      designation: t.designation,
      department: t.department.name,
    }));
  }

  /** The course parts a given teacher is assigned to (their teaching load). */
  async listTeacherAssignments(actor: AuthUser, teacherPublicId: string) {
    const teacher = await this.prisma.db.teacher.findFirst({
      where: { publicId: teacherPublicId },
      select: { id: true, departmentId: true, department: { select: { facultyId: true } } },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');
    this.acl.assertDepartment(actor, teacher.departmentId, teacher.department.facultyId);

    const parts = await this.prisma.db.coursePart.findMany({
      where: { assignedTeacherId: teacher.id, deletedAt: null },
      select: {
        publicId: true,
        name: true,
        course: {
          select: {
            code: true,
            name: true,
            semester: { select: { number: true, name: true } },
          },
        },
        _count: { select: { exams: { where: { deletedAt: null } } } },
      },
      orderBy: [{ course: { code: 'asc' } }, { name: 'asc' }],
    });

    return parts.map((p) => ({
      publicId: p.publicId,
      name: p.name,
      courseCode: p.course.code,
      courseName: p.course.name,
      semesterLabel: p.course.semester.name ?? `Semester ${p.course.semester.number}`,
      examCount: p._count.exams,
    }));
  }

  /** Admin teacher list — all teachers, optionally filtered by department. */
  async listTeachersAdmin(actor: AuthUser, departmentPublicId?: string) {
    const scope = this.deptScopeId(actor);
    const department: Prisma.DepartmentWhereInput = {};
    if (departmentPublicId) department.publicId = departmentPublicId;
    if (scope != null) department.id = scope;
    const where: Prisma.TeacherWhereInput = Object.keys(department).length ? { department } : {};
    return this.prisma.db.teacher.findMany({
      where,
      select: teacherAdminSelect,
      orderBy: { user: { displayName: 'asc' } },
    });
  }

  async createTeacherManual(ctx: OrgContext, dto: CreateTeacherManualDto) {
    const dept = await this.departmentRef(dto.departmentPublicId);
    this.acl.assertFaculty(ctx.actor, dept.facultyId);

    const teacherRole = await this.prisma.db.role.findUnique({ where: { name: 'teacher' } });
    if (!teacherRole) throw new BadRequestException('Role "teacher" missing — run seed first');

    // Teachers sign in with their email; username is an internal unique handle only.
    const username = `${
      dto.email
        .split('@')[0]
        ?.replace(/[^a-z0-9]/gi, '')
        .toLowerCase() ?? 'teacher'
    }_${Math.random().toString(36).slice(2, 8)}`;
    const hash = await this.password.hash(TEACHER_DEFAULT_PASSWORD);

    return this.mutate(ctx, 'teacher.create', 'Teacher', async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          email: dto.email,
          passwordHash: hash,
          displayName: dto.displayName,
          mustChangePassword: true,
        },
      });
      const teacher = await tx.teacher.create({
        data: { userId: user.id, departmentId: dept.id, designation: dto.designation ?? null },
        select: teacherAdminSelect,
      });
      await tx.userRole.create({
        data: { userId: user.id, roleId: teacherRole.id, scopeDepartmentId: dept.id },
      });
      return { result: teacher, entityId: teacher.publicId, after: teacher };
    });
  }

  async updateTeacher(ctx: OrgContext, publicId: string, dto: UpdateTeacherDto) {
    const teacher = await this.prisma.db.teacher.findFirst({
      where: { publicId },
      select: { id: true, userId: true, department: { select: { facultyId: true } } },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');
    this.acl.assertFaculty(ctx.actor, teacher.department.facultyId);

    return this.mutate(ctx, 'teacher.update', 'Teacher', async (tx) => {
      if (dto.displayName) {
        await tx.user.update({
          where: { id: teacher.userId },
          data: { displayName: dto.displayName },
        });
      }
      const result = await tx.teacher.update({
        where: { publicId },
        data: { designation: dto.designation },
        select: teacherAdminSelect,
      });
      return { result, entityId: publicId, after: result };
    });
  }

  async deleteTeacher(ctx: OrgContext, publicId: string) {
    const teacher = await this.prisma.db.teacher.findFirst({
      where: { publicId },
      select: {
        id: true,
        userId: true,
        user: { select: { username: true } },
        department: { select: { facultyId: true } },
      },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');
    this.acl.assertFaculty(ctx.actor, teacher.department.facultyId);

    const del = `__del_${Date.now()}`;
    return this.mutate(ctx, 'teacher.delete', 'Teacher', async (tx) => {
      const result = await tx.teacher.update({
        where: { publicId },
        data: { deletedAt: new Date() },
        select: teacherAdminSelect,
      });
      // Mangle username/email so those unique slots are freed for re-use.
      await tx.user.update({
        where: { id: teacher.userId },
        data: { deletedAt: new Date(), username: `${teacher.user.username}${del}`, email: null },
      });
      return { result, entityId: publicId, after: { deletedAt: new Date() } };
    });
  }

  async exportTeachers(
    departmentPublicId?: string,
    format: ExportFormat = 'xlsx',
  ): Promise<StreamableFile> {
    const where = departmentPublicId ? { department: { publicId: departmentPublicId } } : undefined;
    const rows = await this.prisma.db.teacher.findMany({
      where,
      select: teacherAdminSelect,
      orderBy: { user: { displayName: 'asc' } },
    });
    // Headers match the teachers import template (teachers now log in by email — no username).
    return this.tableFile(
      'Teachers',
      [
        { header: 'name', key: 'name', width: 30 },
        { header: 'email', key: 'email', width: 30 },
        { header: 'department', key: 'department', width: 30 },
        { header: 'designation', key: 'designation', width: 25 },
      ],
      rows.map((t) => ({
        name: t.user.displayName,
        email: t.user.email ?? '',
        department: t.department.name,
        designation: t.designation ?? '',
      })),
      'teachers',
      format,
    );
  }

  // ─────────────────────── Structure exports ───────────────────────
  // Column headers match the import templates, so an exported sheet can be edited and re-imported.

  /** Emit a table as either a formatted .xlsx (bold header) or a UTF-8 CSV (BOM for Excel). */
  private async tableFile(
    sheet: string,
    columns: { header: string; key: string; width: number }[],
    rows: Record<string, string | number>[],
    baseName: string,
    format: ExportFormat,
  ): Promise<StreamableFile> {
    if (format === 'csv') {
      const esc = (v: string | number): string => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [columns.map((c) => esc(c.header)).join(',')];
      for (const r of rows) lines.push(columns.map((c) => esc(r[c.key] ?? '')).join(','));
      const csv = String.fromCharCode(0xfeff) + lines.join('\r\n'); // BOM so Excel detects UTF-8
      return new StreamableFile(Buffer.from(csv, 'utf8'), {
        type: 'text/csv; charset=utf-8',
        disposition: `attachment; filename="${baseName}.csv"`,
      });
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheet);
    ws.columns = columns;
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(r);
    const buffer = await wb.xlsx.writeBuffer();
    return new StreamableFile(Buffer.from(buffer), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${baseName}.xlsx"`,
    });
  }

  async exportFaculties(format: ExportFormat = 'xlsx'): Promise<StreamableFile> {
    const rows = await this.prisma.db.faculty.findMany({
      select: { name: true, _count: { select: { departments: true } } },
      orderBy: { name: 'asc' },
    });
    return this.tableFile(
      'Faculties',
      [
        { header: 'name', key: 'name', width: 36 },
        { header: 'departments', key: 'departments', width: 14 },
      ],
      rows.map((f) => ({ name: f.name, departments: f._count.departments })),
      'faculties',
      format,
    );
  }

  async exportDepartments(format: ExportFormat = 'xlsx'): Promise<StreamableFile> {
    const rows = await this.prisma.db.department.findMany({
      select: { name: true, faculty: { select: { name: true } } },
      orderBy: [{ faculty: { name: 'asc' } }, { name: 'asc' }],
    });
    return this.tableFile(
      'Departments',
      [
        { header: 'name', key: 'name', width: 36 },
        { header: 'faculty', key: 'faculty', width: 30 },
      ],
      rows.map((d) => ({ name: d.name, faculty: d.faculty.name })),
      'departments',
      format,
    );
  }

  async exportSemesters(format: ExportFormat = 'xlsx'): Promise<StreamableFile> {
    const rows = await this.prisma.db.semester.findMany({
      select: {
        number: true,
        name: true,
        batch: { select: { name: true, program: { select: { name: true } } } },
      },
      orderBy: [{ batch: { program: { name: 'asc' } } }, { number: 'asc' }],
    });
    return this.tableFile(
      'Semesters',
      [
        { header: 'program', key: 'program', width: 24 },
        { header: 'batch', key: 'batch', width: 18 },
        { header: 'number', key: 'number', width: 10 },
        { header: 'name', key: 'name', width: 28 },
      ],
      rows.map((s) => ({
        program: s.batch.program.name,
        batch: s.batch.name,
        number: s.number,
        name: s.name ?? '',
      })),
      'semesters',
      format,
    );
  }

  async exportCourses(format: ExportFormat = 'xlsx'): Promise<StreamableFile> {
    const rows = await this.prisma.db.course.findMany({
      select: {
        code: true,
        name: true,
        credit: true,
        semester: {
          select: {
            number: true,
            batch: { select: { name: true, program: { select: { name: true } } } },
          },
        },
      },
      orderBy: [{ code: 'asc' }],
    });
    return this.tableFile(
      'Courses',
      [
        { header: 'code', key: 'code', width: 16 },
        { header: 'name', key: 'name', width: 36 },
        { header: 'credit', key: 'credit', width: 10 },
        { header: 'program', key: 'program', width: 24 },
        { header: 'batch', key: 'batch', width: 18 },
        { header: 'semesterNumber', key: 'semesterNumber', width: 16 },
      ],
      rows.map((c) => ({
        code: c.code,
        name: c.name,
        credit: c.credit,
        program: c.semester.batch.program.name,
        batch: c.semester.batch.name,
        semesterNumber: c.semester.number,
      })),
      'courses',
      format,
    );
  }

  // ─────────────────────────────── Batch ───────────────────────────────
  listBatches(actor: AuthUser, programPublicId?: string, departmentPublicId?: string) {
    const scope = this.deptScopeId(actor);
    const program: Prisma.ProgramWhereInput = {};
    if (programPublicId) program.publicId = programPublicId;
    const deptFilter: Prisma.DepartmentWhereInput = {};
    if (scope != null) deptFilter.id = scope;
    if (departmentPublicId) deptFilter.publicId = departmentPublicId;
    if (Object.keys(deptFilter).length) program.department = deptFilter;
    const where: Prisma.BatchWhereInput = Object.keys(program).length ? { program } : {};
    return this.prisma.db.batch.findMany({
      where,
      select: batchSelect,
      orderBy: { year: 'desc' },
    });
  }
  private async batchRef(
    publicId: string,
  ): Promise<{ id: number; facultyId: number; programId: number }> {
    const b = await this.prisma.db.batch.findFirst({
      where: { publicId },
      select: {
        id: true,
        programId: true,
        program: { select: { department: { select: { facultyId: true } } } },
      },
    });
    if (!b) throw new NotFoundException('Batch not found');
    return { id: b.id, facultyId: b.program.department.facultyId, programId: b.programId };
  }
  async createBatch(ctx: OrgContext, dto: CreateBatchDto) {
    const program = await this.programRef(dto.programPublicId);
    this.acl.assertFaculty(ctx.actor, program.facultyId);
    return this.mutate(ctx, 'batch.create', 'Batch', async (tx) => {
      const result = await tx.batch.create({
        data: { programId: program.id, name: dto.name, year: dto.year },
        select: batchSelect,
      });
      return { result, entityId: result.publicId, after: result };
    });
  }
  async updateBatch(ctx: OrgContext, publicId: string, dto: UpdateBatchDto) {
    const ref = await this.batchRef(publicId);
    this.acl.assertFaculty(ctx.actor, ref.facultyId);
    return this.mutate(ctx, 'batch.update', 'Batch', async (tx) => {
      const result = await tx.batch.update({ where: { publicId }, data: dto, select: batchSelect });
      return { result, entityId: publicId, after: result };
    });
  }
  async removeBatch(ctx: OrgContext, publicId: string) {
    const ref = await this.batchRef(publicId);
    this.acl.assertFaculty(ctx.actor, ref.facultyId);
    return this.mutate(ctx, 'batch.delete', 'Batch', async (tx) => {
      const result = await tx.batch.update({
        where: { publicId },
        data: { deletedAt: new Date() },
        select: batchSelect,
      });
      return { result, entityId: publicId, after: { deletedAt: new Date() } };
    });
  }

  /** Assign (or clear) the semester a batch currently sits in. The semester must be one of the
   *  batch's own semesters, so its students only ever see their batch's coursework. */
  async assignBatchSemester(ctx: OrgContext, batchPublicId: string, dto: AssignBatchSemesterDto) {
    const batch = await this.batchRef(batchPublicId);
    this.acl.assertFaculty(ctx.actor, batch.facultyId);

    let semesterId: number | null = null;
    if (dto.semesterPublicId) {
      const semester = await this.semesterRef(dto.semesterPublicId);
      if (semester.batchId !== batch.id) {
        throw new BadRequestException('Semester belongs to a different batch');
      }
      semesterId = semester.id;
    }

    return this.mutate(ctx, 'batch.assignSemester', 'Batch', async (tx) => {
      const result = await tx.batch.update({
        where: { publicId: batchPublicId },
        data: { currentSemesterId: semesterId },
        select: batchSelect,
      });
      return { result, entityId: batchPublicId, after: { semesterId } };
    });
  }

  // ─────────────────────────────── Students ───────────────────────────────
  listStudents(actor: AuthUser, batchPublicId?: string) {
    const scope = this.deptScopeId(actor);
    const batch: Prisma.BatchWhereInput = {};
    if (batchPublicId) batch.publicId = batchPublicId;
    if (scope != null) batch.program = { department: { id: scope } };
    const where: Prisma.StudentWhereInput = Object.keys(batch).length ? { batch } : {};
    return this.prisma.db.student.findMany({
      where,
      select: studentSelect,
      orderBy: { studentId: 'asc' },
    });
  }

  /** Move a student to a different batch. */
  async changeStudentBatch(ctx: OrgContext, studentPublicId: string, dto: ChangeStudentBatchDto) {
    const student = await this.prisma.db.student.findFirst({
      where: { publicId: studentPublicId },
      select: { id: true, batchId: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    const targetBatch = await this.batchRef(dto.batchPublicId);
    this.acl.assertFaculty(ctx.actor, targetBatch.facultyId);

    return this.mutate(ctx, 'student.changeBatch', 'Student', async (tx) => {
      const result = await tx.student.update({
        where: { publicId: studentPublicId },
        data: { batchId: targetBatch.id },
        select: studentSelect,
      });
      return {
        result,
        entityId: studentPublicId,
        before: { batchId: student.batchId },
        after: { batchId: targetBatch.id },
      };
    });
  }

  async createStudentManual(ctx: OrgContext, dto: CreateStudentManualDto) {
    const batch = await this.batchRef(dto.batchPublicId);
    this.acl.assertFaculty(ctx.actor, batch.facultyId);

    const studentRole = await this.prisma.db.role.findUnique({ where: { name: 'student' } });
    if (!studentRole) throw new BadRequestException('Role "student" missing — run seed first');

    await this.freeDeletedUserSlot(dto.studentId);
    await this.freeDeletedStudentSlot(dto.studentId);
    const hash = await this.password.hash('Student@123');

    return this.mutate(ctx, 'student.create', 'Student', async (tx) => {
      const user = await tx.user.create({
        data: {
          username: dto.studentId,
          email: dto.email ?? null,
          passwordHash: hash,
          displayName: dto.displayName,
          mustChangePassword: false,
        },
      });
      const student = await tx.student.create({
        data: {
          userId: user.id,
          batchId: batch.id,
          studentId: dto.studentId,
          registrationNumber: dto.registrationNumber ?? null,
        },
        select: studentSelect,
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: studentRole.id } });
      return { result: student, entityId: student.publicId, after: student };
    });
  }

  async updateStudent(ctx: OrgContext, studentPublicId: string, dto: UpdateStudentDto) {
    const student = await this.prisma.db.student.findFirst({
      where: { publicId: studentPublicId },
      select: {
        id: true,
        userId: true,
        batch: { select: { program: { select: { department: { select: { facultyId: true } } } } } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    this.acl.assertFaculty(ctx.actor, student.batch.program.department.facultyId);

    return this.mutate(ctx, 'student.update', 'Student', async (tx) => {
      if (dto.displayName !== undefined || dto.email !== undefined) {
        await tx.user.update({
          where: { id: student.userId },
          data: {
            ...(dto.displayName ? { displayName: dto.displayName } : {}),
            ...(dto.email !== undefined ? { email: dto.email || null } : {}),
          },
        });
      }
      const result = await tx.student.update({
        where: { publicId: studentPublicId },
        data: {
          ...(dto.registrationNumber !== undefined
            ? { registrationNumber: dto.registrationNumber || null }
            : {}),
        },
        select: studentSelect,
      });
      return { result, entityId: studentPublicId, after: dto };
    });
  }

  async deleteStudent(ctx: OrgContext, studentPublicId: string) {
    const student = await this.prisma.db.student.findFirst({
      where: { publicId: studentPublicId },
      select: {
        id: true,
        userId: true,
        studentId: true,
        user: { select: { username: true } },
        batch: { select: { program: { select: { department: { select: { facultyId: true } } } } } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    this.acl.assertFaculty(ctx.actor, student.batch.program.department.facultyId);

    const del = `__del_${Date.now()}`;
    return this.mutate(ctx, 'student.delete', 'Student', async (tx) => {
      const result = await tx.student.update({
        where: { publicId: studentPublicId },
        data: {
          deletedAt: new Date(),
          studentId: `${student.studentId}${del}`,
          registrationNumber: null,
        },
        select: studentSelect,
      });
      await tx.user.update({
        where: { id: student.userId },
        data: { deletedAt: new Date(), username: `${student.user.username}${del}`, email: null },
      });
      return { result, entityId: studentPublicId, after: { deletedAt: new Date() } };
    });
  }

  async exportStudents(
    batchPublicId?: string,
    format: ExportFormat = 'xlsx',
  ): Promise<StreamableFile> {
    const rows = await this.prisma.db.student.findMany({
      where: batchPublicId ? { batch: { publicId: batchPublicId } } : {},
      select: {
        ...studentSelect,
        user: { select: { displayName: true, email: true } },
      },
      orderBy: { studentId: 'asc' },
    });
    // Headers match the students import template (studentId/name/email/registrationNumber);
    // `batch` is included for reference — on import the target batch is chosen in the dialog.
    return this.tableFile(
      'Students',
      [
        { header: 'studentId', key: 'studentId', width: 15 },
        { header: 'name', key: 'name', width: 30 },
        { header: 'email', key: 'email', width: 30 },
        { header: 'batch', key: 'batch', width: 20 },
        { header: 'registrationNumber', key: 'registrationNumber', width: 25 },
      ],
      rows.map((s) => ({
        studentId: s.studentId,
        name: s.user.displayName,
        email: s.user.email ?? '',
        batch: s.batch.name,
        registrationNumber: s.registrationNumber ?? '',
      })),
      'students',
      format,
    );
  }
}
