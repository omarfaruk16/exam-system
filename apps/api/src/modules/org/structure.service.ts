import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessControlService } from '../../common/access/access-control.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';
import { AuditService } from '../audit/audit.service';
import type {
  CreateBatchDto,
  CreateCourseDto,
  CreateCoursePartDto,
  CreateDepartmentDto,
  CreateFacultyDto,
  CreateProgramDto,
  CreateSemesterDto,
  UpdateBatchDto,
  UpdateCourseDto,
  UpdateCoursePartDto,
  UpdateDepartmentDto,
  UpdateFacultyDto,
  UpdateProgramDto,
} from './dto/structure.dto';
import {
  batchSelect,
  coursePartSelect,
  courseSelect,
  departmentSelect,
  facultySelect,
  programSelect,
  semesterSelect,
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
  ) {}

  // ─────────────────────────── parent / scope resolvers ───────────────────────────
  // Each returns the FK id plus the faculty the entity lives under, so we can scope-check.

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

  private async programRef(publicId: string): Promise<{ id: number; facultyId: number }> {
    const p = await this.prisma.db.program.findFirst({
      where: { publicId },
      select: { id: true, department: { select: { facultyId: true } } },
    });
    if (!p) throw new NotFoundException('Program not found');
    return { id: p.id, facultyId: p.department.facultyId };
  }

  private async semesterRef(publicId: string): Promise<{ id: number; facultyId: number }> {
    const s = await this.prisma.db.semester.findFirst({
      where: { publicId },
      select: { id: true, program: { select: { department: { select: { facultyId: true } } } } },
    });
    if (!s) throw new NotFoundException('Semester not found');
    return { id: s.id, facultyId: s.program.department.facultyId };
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

  private async coursePartFaculty(publicId: string): Promise<number> {
    const cp = await this.prisma.db.coursePart.findFirst({
      where: { publicId },
      select: {
        course: {
          select: {
            semester: {
              select: { program: { select: { department: { select: { facultyId: true } } } } },
            },
          },
        },
      },
    });
    if (!cp) throw new NotFoundException('Course part not found');
    return cp.course.semester.program.department.facultyId;
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
      const result = await tx.faculty.create({
        data: { name: dto.name, code: dto.code },
        select: facultySelect,
      });
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
    const before = await this.getFaculty(publicId);
    return this.mutate(ctx, 'faculty.delete', 'Faculty', async (tx) => {
      const result = await tx.faculty.update({
        where: { publicId },
        data: { deletedAt: new Date() },
        select: facultySelect,
      });
      return { result, entityId: publicId, before, after: { deletedAt: new Date() } };
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
        data: { facultyId: faculty.id, name: dto.name, code: dto.code },
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
    const before = await this.getDepartment(publicId);
    return this.mutate(ctx, 'department.delete', 'Department', async (tx) => {
      const result = await tx.department.update({
        where: { publicId },
        data: { deletedAt: new Date() },
        select: departmentSelect,
      });
      return { result, entityId: publicId, before, after: { deletedAt: new Date() } };
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

  // ─────────────────────────────── Batch ───────────────────────────────
  listBatches(programPublicId?: string) {
    return this.prisma.db.batch.findMany({
      where: programPublicId ? { program: { publicId: programPublicId } } : {},
      select: batchSelect,
      orderBy: { admissionYear: 'desc' },
    });
  }
  async createBatch(ctx: OrgContext, dto: CreateBatchDto) {
    const program = await this.programRef(dto.programPublicId);
    this.acl.assertFaculty(ctx.actor, program.facultyId);
    return this.mutate(ctx, 'batch.create', 'Batch', async (tx) => {
      const result = await tx.batch.create({
        data: { programId: program.id, name: dto.name, admissionYear: dto.admissionYear },
        select: batchSelect,
      });
      return { result, entityId: result.publicId, after: result };
    });
  }
  async updateBatch(ctx: OrgContext, publicId: string, dto: UpdateBatchDto) {
    const b = await this.prisma.db.batch.findFirst({
      where: { publicId },
      select: { program: { select: { department: { select: { facultyId: true } } } } },
    });
    if (!b) throw new NotFoundException('Batch not found');
    this.acl.assertFaculty(ctx.actor, b.program.department.facultyId);
    return this.mutate(ctx, 'batch.update', 'Batch', async (tx) => {
      const result = await tx.batch.update({ where: { publicId }, data: dto, select: batchSelect });
      return { result, entityId: publicId, after: result };
    });
  }
  async removeBatch(ctx: OrgContext, publicId: string) {
    const b = await this.prisma.db.batch.findFirst({
      where: { publicId },
      select: { program: { select: { department: { select: { facultyId: true } } } } },
    });
    if (!b) throw new NotFoundException('Batch not found');
    this.acl.assertFaculty(ctx.actor, b.program.department.facultyId);
    return this.mutate(ctx, 'batch.delete', 'Batch', async (tx) => {
      const result = await tx.batch.update({
        where: { publicId },
        data: { deletedAt: new Date() },
        select: batchSelect,
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
    const ref = await this.courseRef(publicId);
    this.acl.assertFaculty(ctx.actor, ref.facultyId);
    return this.mutate(ctx, 'course.delete', 'Course', async (tx) => {
      const result = await tx.course.update({
        where: { publicId },
        data: { deletedAt: new Date() },
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
    this.acl.assertFaculty(ctx.actor, await this.coursePartFaculty(publicId));
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
    this.acl.assertFaculty(ctx.actor, await this.coursePartFaculty(publicId));
    return this.mutate(ctx, 'coursePart.delete', 'CoursePart', async (tx) => {
      const result = await tx.coursePart.update({
        where: { publicId },
        data: { deletedAt: new Date() },
        select: coursePartSelect,
      });
      return { result, entityId: publicId, after: { deletedAt: new Date() } };
    });
  }
}
