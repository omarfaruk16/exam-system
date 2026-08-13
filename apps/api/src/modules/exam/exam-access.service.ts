import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessControlService } from '../../common/access/access-control.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';

export interface OfferingPartContext {
  offeringPartId: number;
  departmentId: number;
  facultyId: number;
  assignedTeacherId: number | null;
}

@Injectable()
export class ExamAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AccessControlService,
  ) {}

  /** The Teacher row for the current user; throws if the user isn't a teacher. */
  async requireTeacher(user: AuthUser): Promise<{ id: number; departmentId: number }> {
    const teacher = await this.prisma.db.teacher.findFirst({
      where: { userId: user.id },
      select: { id: true, departmentId: true },
    });
    if (!teacher) throw new ForbiddenException('Only a teacher can perform this action');
    return teacher;
  }

  /**
   * Loads an offering part with its integrity + scope info. Uses the BASE client so soft-deleted
   * rows are visible — we must be able to *detect* and reject them (the Phase-2 cascade gap must
   * not become an exam integrity hole). Rejects with 400 if the part or its offering is removed.
   */
  async loadActiveOfferingPart(offeringPartPublicId: string): Promise<OfferingPartContext> {
    const op = await this.prisma.offeringPart.findUnique({
      where: { publicId: offeringPartPublicId },
      select: {
        id: true,
        deletedAt: true,
        assignedTeacherId: true,
        offering: {
          select: {
            deletedAt: true,
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
        },
      },
    });
    if (!op) throw new NotFoundException('Offering part not found');
    if (op.deletedAt) throw new BadRequestException('This offering part has been removed');
    if (op.offering.deletedAt)
      throw new BadRequestException('This course offering has been removed');

    return {
      offeringPartId: op.id,
      departmentId: op.offering.course.semester.program.departmentId,
      facultyId: op.offering.course.semester.program.department.facultyId,
      assignedTeacherId: op.assignedTeacherId,
    };
  }

  /**
   * Authoring guard: the offering part must be active AND assigned to the requesting teacher.
   * Returns the teacher id and the part context.
   */
  async requireAuthorablePart(
    user: AuthUser,
    offeringPartPublicId: string,
  ): Promise<OfferingPartContext & { teacherId: number }> {
    const ctx = await this.loadActiveOfferingPart(offeringPartPublicId);
    const teacher = await this.requireTeacher(user);
    if (ctx.assignedTeacherId !== teacher.id) {
      throw new ForbiddenException('You are not assigned to this offering part');
    }
    return { ...ctx, teacherId: teacher.id };
  }

  /** Admin/super_admin scope check on an exam's department (faculty-scoped admins are confined). */
  assertAdminScope(user: AuthUser, ctx: { departmentId: number; facultyId: number }): void {
    this.acl.assertDepartment(user, ctx.departmentId, ctx.facultyId);
  }
}
