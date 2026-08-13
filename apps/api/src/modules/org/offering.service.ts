import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessControlService } from '../../common/access/access-control.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';
import { AuditService } from '../audit/audit.service';
import type {
  AssignTeacherDto,
  CreateOfferingDto,
  CreateOfferingPartDto,
  CreateTermDto,
  UpdateTermDto,
} from './dto/offering.dto';
import type { OrgContext } from './structure.service';
import { offeringPartSelect, offeringSelect, termSelect } from './org.select';

// Reaches from an offering up to the owning department/faculty (for scope checks).
const offeringDeptSelect = {
  course: {
    select: {
      semester: {
        select: {
          program: { select: { departmentId: true, department: { select: { facultyId: true } } } },
        },
      },
    },
  },
} satisfies Prisma.CourseOfferingSelect;

@Injectable()
export class OfferingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly acl: AccessControlService,
  ) {}

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

  /** Restricts a CourseOffering query to what the actor may see (super_admin: all). */
  private offeringScopeWhere(actor: AuthUser): Prisma.CourseOfferingWhereInput {
    if (this.acl.isSuperAdmin(actor)) return {};
    if (actor.roles.some((r) => r.role === 'admin' && r.scopeFacultyId === null)) return {};

    const facultyIds = actor.roles
      .filter((r) => r.role === 'admin' && r.scopeFacultyId !== null)
      .map((r) => r.scopeFacultyId as number);
    const deptIds = actor.roles
      .filter((r) => r.role === 'department_head' && r.scopeDepartmentId !== null)
      .map((r) => r.scopeDepartmentId as number);

    const or: Prisma.CourseOfferingWhereInput[] = [];
    if (facultyIds.length) {
      or.push({
        course: { semester: { program: { department: { facultyId: { in: facultyIds } } } } },
      });
    }
    if (deptIds.length) {
      or.push({ course: { semester: { program: { departmentId: { in: deptIds } } } } });
    }
    // No scope at all → match nothing.
    return or.length ? { OR: or } : { id: -1 };
  }

  // ─────────────────────────────── Academic term ───────────────────────────────
  listTerms() {
    return this.prisma.db.academicTerm.findMany({
      select: termSelect,
      orderBy: { startDate: 'desc' },
    });
  }
  createTerm(ctx: OrgContext, dto: CreateTermDto) {
    return this.mutate(ctx, 'term.create', 'AcademicTerm', async (tx) => {
      const result = await tx.academicTerm.create({
        data: {
          name: dto.name,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          isActive: dto.isActive ?? false,
        },
        select: termSelect,
      });
      return { result, entityId: result.publicId, after: result };
    });
  }
  updateTerm(ctx: OrgContext, publicId: string, dto: UpdateTermDto) {
    return this.mutate(ctx, 'term.update', 'AcademicTerm', async (tx) => {
      const result = await tx.academicTerm.update({
        where: { publicId },
        data: {
          name: dto.name,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          isActive: dto.isActive,
        },
        select: termSelect,
      });
      return { result, entityId: publicId, after: result };
    });
  }
  removeTerm(ctx: OrgContext, publicId: string) {
    return this.mutate(ctx, 'term.delete', 'AcademicTerm', async (tx) => {
      const result = await tx.academicTerm.update({
        where: { publicId },
        data: { deletedAt: new Date() },
        select: termSelect,
      });
      return { result, entityId: publicId, after: { deletedAt: new Date() } };
    });
  }

  // ─────────────────────────────── Offering ───────────────────────────────
  listOfferings(actor: AuthUser) {
    return this.prisma.db.courseOffering.findMany({
      where: this.offeringScopeWhere(actor),
      select: offeringSelect,
      orderBy: { publicId: 'asc' },
    });
  }

  async createOffering(ctx: OrgContext, dto: CreateOfferingDto) {
    const course = await this.prisma.db.course.findFirst({
      where: { publicId: dto.coursePublicId },
      select: {
        id: true,
        semester: {
          select: { program: { select: { department: { select: { facultyId: true } } } } },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    const batch = await this.prisma.db.batch.findFirst({
      where: { publicId: dto.batchPublicId },
      select: { id: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    const term = await this.prisma.db.academicTerm.findFirst({
      where: { publicId: dto.termPublicId },
      select: { id: true },
    });
    if (!term) throw new NotFoundException('Term not found');

    this.acl.assertFaculty(ctx.actor, course.semester.program.department.facultyId);

    return this.mutate(ctx, 'offering.create', 'CourseOffering', async (tx) => {
      const result = await tx.courseOffering.create({
        data: { courseId: course.id, batchId: batch.id, termId: term.id },
        select: offeringSelect,
      });
      return { result, entityId: result.publicId, after: result };
    });
  }

  async removeOffering(ctx: OrgContext, publicId: string) {
    const off = await this.prisma.db.courseOffering.findFirst({
      where: { publicId },
      select: offeringDeptSelect,
    });
    if (!off) throw new NotFoundException('Offering not found');
    this.acl.assertFaculty(ctx.actor, off.course.semester.program.department.facultyId);
    return this.mutate(ctx, 'offering.delete', 'CourseOffering', async (tx) => {
      const result = await tx.courseOffering.update({
        where: { publicId },
        data: { deletedAt: new Date() },
        select: offeringSelect,
      });
      return { result, entityId: publicId, after: { deletedAt: new Date() } };
    });
  }

  // ─────────────────────────────── Offering part ───────────────────────────────
  async listOfferingParts(actor: AuthUser, offeringPublicId: string) {
    const off = await this.prisma.db.courseOffering.findFirst({
      where: { publicId: offeringPublicId },
      select: { ...offeringDeptSelect, id: true },
    });
    if (!off) throw new NotFoundException('Offering not found');
    // Scope gate: reading parts of an offering requires access to its department.
    this.acl.assertDepartment(
      actor,
      off.course.semester.program.departmentId,
      off.course.semester.program.department.facultyId,
    );
    return this.prisma.db.offeringPart.findMany({
      where: { offering: { publicId: offeringPublicId } },
      select: offeringPartSelect,
      orderBy: { publicId: 'asc' },
    });
  }

  async createOfferingPart(ctx: OrgContext, dto: CreateOfferingPartDto) {
    const offering = await this.prisma.db.courseOffering.findFirst({
      where: { publicId: dto.offeringPublicId },
      select: { ...offeringDeptSelect, id: true },
    });
    if (!offering) throw new NotFoundException('Offering not found');
    const coursePart = await this.prisma.db.coursePart.findFirst({
      where: { publicId: dto.coursePartPublicId },
      select: { id: true },
    });
    if (!coursePart) throw new NotFoundException('Course part not found');
    this.acl.assertFaculty(ctx.actor, offering.course.semester.program.department.facultyId);

    return this.mutate(ctx, 'offeringPart.create', 'OfferingPart', async (tx) => {
      const result = await tx.offeringPart.create({
        data: { offeringId: offering.id, coursePartId: coursePart.id },
        select: offeringPartSelect,
      });
      return { result, entityId: result.publicId, after: result };
    });
  }

  /**
   * Assign or reassign (teacherPublicId null → unassign) a teacher to an offering part.
   * Department heads may only touch parts within their OWN department (§6.2), enforced here.
   */
  async assignTeacher(ctx: OrgContext, offeringPartPublicId: string, dto: AssignTeacherDto) {
    const op = await this.prisma.db.offeringPart.findFirst({
      where: { publicId: offeringPartPublicId },
      select: {
        assignedTeacher: { select: { publicId: true } },
        offering: { select: offeringDeptSelect },
      },
    });
    if (!op) throw new NotFoundException('Offering part not found');

    const departmentId = op.offering.course.semester.program.departmentId;
    const facultyId = op.offering.course.semester.program.department.facultyId;
    // ── SCOPE ENFORCEMENT: denies a CSE head from touching a Physics offering part ──
    this.acl.assertDepartment(ctx.actor, departmentId, facultyId);

    let teacherId: number | null = null;
    let teacherPublicId: string | null = null;
    if (dto.teacherPublicId) {
      const teacher = await this.prisma.db.teacher.findFirst({
        where: { publicId: dto.teacherPublicId },
        select: { id: true, publicId: true, departmentId: true },
      });
      if (!teacher) throw new NotFoundException('Teacher not found');
      if (teacher.departmentId !== departmentId) {
        throw new BadRequestException('Teacher belongs to a different department');
      }
      teacherId = teacher.id;
      teacherPublicId = teacher.publicId;
    }

    const before = { assignedTeacherPublicId: op.assignedTeacher?.publicId ?? null };
    return this.mutate(
      ctx,
      teacherId ? 'offeringPart.assign_teacher' : 'offeringPart.unassign_teacher',
      'OfferingPart',
      async (tx) => {
        const result = await tx.offeringPart.update({
          where: { publicId: offeringPartPublicId },
          data: { assignedTeacherId: teacherId },
          select: offeringPartSelect,
        });
        return {
          result,
          entityId: offeringPartPublicId,
          before,
          after: { assignedTeacherPublicId: teacherPublicId },
        };
      },
    );
  }
}
