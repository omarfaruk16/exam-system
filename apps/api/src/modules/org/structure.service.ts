import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
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
  ): Promise<{ id: number; facultyId: number; programId: number }> {
    const s = await this.prisma.db.semester.findFirst({
      where: { publicId },
      select: {
        id: true,
        programId: true,
        program: { select: { department: { select: { facultyId: true } } } },
      },
    });
    if (!s) throw new NotFoundException('Semester not found');
    return { id: s.id, facultyId: s.program.department.facultyId, programId: s.programId };
  }

  private async courseRef(publicId: string): Promise<{ id: number; facultyId: number }> {
    const c = await this.prisma.db.course.findFirst({
      where: { publicId },
      select: {
        id: true,
        semester: {
          select: { program: { select: { department: { select: { facultyId: true } } } } },
        },
      },
    });
    if (!c) throw new NotFoundException('Course not found');
    return { id: c.id, facultyId: c.semester.program.department.facultyId };
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
                program: {
                  select: { departmentId: true, department: { select: { facultyId: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!cp) throw new NotFoundException('Course part not found');
    const program = cp.course.semester.program;
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
  listFaculties() {
    return this.prisma.db.faculty.findMany({ select: facultySelect, orderBy: { name: 'asc' } });
  }
  async getFaculty(publicId: string) {
    const row = await this.prisma.db.faculty.findFirst({
      where: { publicId },
      select: facultySelect,
    });
    if (!row) throw new NotFoundException('Faculty not found');
    return row;
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
  listDepartments(facultyPublicId?: string) {
    return this.prisma.db.department.findMany({
      where: facultyPublicId ? { faculty: { publicId: facultyPublicId } } : {},
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
  listPrograms(departmentPublicId?: string) {
    return this.prisma.db.program.findMany({
      where: departmentPublicId ? { department: { publicId: departmentPublicId } } : {},
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
  listSemesters(programPublicId?: string) {
    return this.prisma.db.semester.findMany({
      where: programPublicId ? { program: { publicId: programPublicId } } : {},
      select: semesterSelect,
      orderBy: { number: 'asc' },
    });
  }
  async createSemester(ctx: OrgContext, dto: CreateSemesterDto) {
    const program = await this.programRef(dto.programPublicId);
    this.acl.assertFaculty(ctx.actor, program.facultyId);
    return this.mutate(ctx, 'semester.create', 'Semester', async (tx) => {
      const result = await tx.semester.create({
        data: { programId: program.id, number: dto.number },
        select: semesterSelect,
      });
      return { result, entityId: result.publicId, after: result };
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
  listCourses(semesterPublicId?: string) {
    return this.prisma.db.course.findMany({
      where: semesterPublicId ? { semester: { publicId: semesterPublicId } } : {},
      select: courseSelect,
      orderBy: { code: 'asc' },
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
          select: { program: { select: { department: { select: { facultyId: true } } } } },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    this.acl.assertFaculty(ctx.actor, course.semester.program.department.facultyId);

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
      const teacher = await this.prisma.db.teacher.findFirst({
        where: { publicId: dto.teacherPublicId },
        select: { id: true, departmentId: true },
      });
      if (!teacher) throw new NotFoundException('Teacher not found');
      if (teacher.departmentId !== part.departmentId) {
        throw new BadRequestException('Teacher belongs to a different department');
      }
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

  /** Selector list: teachers within a department (for the assign-teacher dropdown). */
  async listTeachers(actor: AuthUser, departmentPublicId: string) {
    const dept = await this.departmentRef(departmentPublicId);
    this.acl.assertDepartment(actor, dept.id, dept.facultyId);
    const teachers = await this.prisma.db.teacher.findMany({
      where: { departmentId: dept.id },
      select: teacherOptionSelect,
      orderBy: { user: { displayName: 'asc' } },
    });
    return teachers.map((t) => ({
      publicId: t.publicId,
      displayName: t.user.displayName,
      username: t.user.username,
      designation: t.designation,
    }));
  }

  /** Admin teacher list — all teachers, optionally filtered by department. */
  async listTeachersAdmin(departmentPublicId?: string) {
    return this.prisma.db.teacher.findMany({
      where: departmentPublicId ? { department: { publicId: departmentPublicId } } : {},
      select: teacherAdminSelect,
      orderBy: { user: { displayName: 'asc' } },
    });
  }

  async createTeacherManual(ctx: OrgContext, dto: CreateTeacherManualDto) {
    const dept = await this.departmentRef(dto.departmentPublicId);
    this.acl.assertFaculty(ctx.actor, dept.facultyId);

    const teacherRole = await this.prisma.db.role.findUnique({ where: { name: 'teacher' } });
    if (!teacherRole) throw new BadRequestException('Role "teacher" missing — run seed first');

    await this.freeDeletedUserSlot(dto.username);
    const hash = await this.password.hash(`${dto.username}@Exam123`);

    return this.mutate(ctx, 'teacher.create', 'Teacher', async (tx) => {
      const user = await tx.user.create({
        data: {
          username: dto.username,
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

  async exportTeachers(): Promise<StreamableFile> {
    const rows = await this.prisma.db.teacher.findMany({
      select: teacherAdminSelect,
      orderBy: { user: { displayName: 'asc' } },
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teachers');
    ws.columns = [
      { header: 'Username', key: 'username', width: 20 },
      { header: 'Display Name', key: 'displayName', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Department', key: 'department', width: 30 },
      { header: 'Designation', key: 'designation', width: 25 },
    ];
    for (const t of rows) {
      ws.addRow({
        username: t.user.username,
        displayName: t.user.displayName,
        email: t.user.email ?? '',
        department: t.department.name,
        designation: t.designation ?? '',
      });
    }
    const buffer = await wb.xlsx.writeBuffer();
    return new StreamableFile(Buffer.from(buffer), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="teachers.xlsx"',
    });
  }

  // ─────────────────────────────── Batch ───────────────────────────────
  listBatches(programPublicId?: string) {
    return this.prisma.db.batch.findMany({
      where: programPublicId ? { program: { publicId: programPublicId } } : {},
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

  /** Assign (or clear) the semester a batch currently sits in. The semester must be in the
   *  batch's own program, so its students only ever see their program's coursework. */
  async assignBatchSemester(ctx: OrgContext, batchPublicId: string, dto: AssignBatchSemesterDto) {
    const batch = await this.batchRef(batchPublicId);
    this.acl.assertFaculty(ctx.actor, batch.facultyId);

    let semesterId: number | null = null;
    if (dto.semesterPublicId) {
      const semester = await this.semesterRef(dto.semesterPublicId);
      if (semester.programId !== batch.programId) {
        throw new BadRequestException('Semester belongs to a different program');
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
  listStudents(batchPublicId?: string) {
    return this.prisma.db.student.findMany({
      where: batchPublicId ? { batch: { publicId: batchPublicId } } : {},
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
          rollNumber: dto.rollNumber ?? null,
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
          ...(dto.rollNumber !== undefined ? { rollNumber: dto.rollNumber || null } : {}),
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

  async exportStudents(batchPublicId?: string): Promise<StreamableFile> {
    const rows = await this.prisma.db.student.findMany({
      where: batchPublicId ? { batch: { publicId: batchPublicId } } : {},
      select: {
        ...studentSelect,
        user: { select: { displayName: true, email: true } },
      },
      orderBy: { studentId: 'asc' },
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Students');
    ws.columns = [
      { header: 'Student ID', key: 'studentId', width: 15 },
      { header: 'Display Name', key: 'displayName', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Batch', key: 'batch', width: 20 },
      { header: 'Registration Number', key: 'registrationNumber', width: 25 },
      { header: 'Roll Number', key: 'rollNumber', width: 15 },
    ];
    for (const s of rows) {
      ws.addRow({
        studentId: s.studentId,
        displayName: s.user.displayName,
        email: s.user.email ?? '',
        batch: s.batch.name,
        registrationNumber: s.registrationNumber ?? '',
        rollNumber: s.rollNumber ?? '',
      });
    }
    const buffer = await wb.xlsx.writeBuffer();
    return new StreamableFile(Buffer.from(buffer), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="students.xlsx"',
    });
  }
}
