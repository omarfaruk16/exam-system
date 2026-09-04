import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessControlService } from '../../common/access/access-control.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';

export interface CoursePartContext {
  coursePartId: number;
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
   * Loads a course part with its integrity + scope info. Uses the BASE client so a soft-deleted
   * part is still visible — we must be able to detect and reject it rather than silently 404.
   */
  async loadActiveCoursePart(coursePartPublicId: string): Promise<CoursePartContext> {
    const cp = await this.prisma.coursePart.findUnique({
      where: { publicId: coursePartPublicId },
      select: {
        id: true,
        deletedAt: true,
        assignedTeacherId: true,
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
    if (cp.deletedAt) throw new BadRequestException('This course part has been removed');

    const program = cp.course.semester.batch.program;
    return {
      coursePartId: cp.id,
      departmentId: program.departmentId,
      facultyId: program.department.facultyId,
      assignedTeacherId: cp.assignedTeacherId,
    };
  }

  /**
   * Authoring guard: the course part must be active AND assigned to the requesting teacher.
   */
  async requireAuthorablePart(
    user: AuthUser,
    coursePartPublicId: string,
  ): Promise<CoursePartContext & { teacherId: number }> {
    const ctx = await this.loadActiveCoursePart(coursePartPublicId);
    const teacher = await this.requireTeacher(user);
    if (ctx.assignedTeacherId !== teacher.id) {
      throw new ForbiddenException('You are not assigned to this course part');
    }
    return { ...ctx, teacherId: teacher.id };
  }

  /**
   * Authoring guard for admin / super_admin / department_head.
   * Checks scope and uses the part's assigned teacher as the exam owner
   * (Exam.createdByTeacherId is non-nullable).
   */
  async requireAuthorablePartForAdmin(
    user: AuthUser,
    coursePartPublicId: string,
  ): Promise<CoursePartContext & { teacherId: number }> {
    const ctx = await this.loadActiveCoursePart(coursePartPublicId);
    this.assertAdminScope(user, ctx);
    if (!ctx.assignedTeacherId) {
      throw new BadRequestException(
        'No teacher is assigned to this course part. Assign a teacher first.',
      );
    }
    return { ...ctx, teacherId: ctx.assignedTeacherId };
  }

  /** Admin/super_admin scope check on an exam's department (faculty-scoped admins are confined). */
  assertAdminScope(user: AuthUser, ctx: { departmentId: number; facultyId: number }): void {
    this.acl.assertDepartment(user, ctx.departmentId, ctx.facultyId);
  }

  /**
   * Unified authoring guard: allows either the teacher assigned to the part OR an
   * admin / super_admin / department_head acting within their scope. Returns a
   * `teacherId` to attribute created rows to (the assigned teacher) — this is null
   * for staff when no teacher is assigned; callers that must set a creator should
   * reject a null teacherId. Used so admins can author question banks/questions and
   * build exams exactly like the assigned teacher.
   */
  async requireAuthorablePartAny(
    user: AuthUser,
    coursePartPublicId: string,
  ): Promise<CoursePartContext & { teacherId: number | null }> {
    const ctx = await this.loadActiveCoursePart(coursePartPublicId);
    const isStaff = user.roles.some(
      (r) => r.role === 'admin' || r.role === 'super_admin' || r.role === 'department_head',
    );
    const isTeacher = user.roles.some((r) => r.role === 'teacher');

    if (isTeacher) {
      const teacher = await this.requireTeacher(user);
      if (ctx.assignedTeacherId === teacher.id) return { ...ctx, teacherId: teacher.id };
      // A teacher who isn't assigned may still act if they ALSO hold a staff role in scope.
      if (!isStaff) {
        throw new ForbiddenException('You are not assigned to this course part');
      }
    }

    if (isStaff) {
      this.assertAdminScope(user, ctx);
      return { ...ctx, teacherId: ctx.assignedTeacherId };
    }

    throw new ForbiddenException('You are not assigned to this course part');
  }
}
