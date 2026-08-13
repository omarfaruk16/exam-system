import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type ExamStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';
import { AuditService } from '../audit/audit.service';
import type { AddExamQuestionDto, CreateExamDto, UpdateExamDto } from './dto/exam.dto';
import { ExamAccessService } from './exam-access.service';
import { ADMIN_EDITABLE_STATUSES, canTransition } from './exam-state';
import { examQuestionSelect, examSelect } from './exam.select';

interface ExamHandle {
  id: number;
  publicId: string;
  status: ExamStatus;
  createdByTeacherId: number;
  offeringPartPublicId: string;
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
        offeringPart: {
          select: {
            publicId: true,
            offering: {
              select: {
                course: {
                  select: {
                    semester: {
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
    const program = exam.offeringPart.offering.course.semester.program;
    return {
      id: exam.id,
      publicId: exam.publicId,
      status: exam.status,
      createdByTeacherId: exam.createdByTeacherId,
      offeringPartPublicId: exam.offeringPart.publicId,
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
    // Guards BOTH the soft-deleted offering part/offering (400) AND teacher assignment (403).
    const ctx = await this.access.requireAuthorablePart(user, dto.offeringPartPublicId);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) throw new BadRequestException('endAt must be after startAt');

    return this.prisma.$transaction(async (tx) => {
      const exam = await tx.exam.create({
        data: {
          offeringPartId: ctx.offeringPartId,
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
    await this.assertOwner(user, exam);
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
    this.access.assertAdminScope(user, exam);
    if (!ADMIN_EDITABLE_STATUSES.includes(exam.status)) {
      throw new BadRequestException(`An exam in ${exam.status} cannot be deleted`);
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
    await this.assertOwner(user, exam);
    if (exam.status !== 'draft') {
      throw new BadRequestException('Questions can only be changed while the exam is a draft');
    }
    const q = await this.prisma.db.question.findFirst({
      where: { publicId: dto.questionPublicId },
      select: { id: true, bank: { select: { offeringPart: { select: { publicId: true } } } } },
    });
    if (!q) throw new NotFoundException('Question not found');
    if (q.bank.offeringPart.publicId !== exam.offeringPartPublicId) {
      throw new BadRequestException('Question is not from this offering part');
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
    await this.assertOwner(user, exam);
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

  // ─────────────────────────── State transitions ───────────────────────────
  async submit(user: AuthUser, ip: string, publicId: string) {
    const exam = await this.loadExam(publicId);
    await this.assertOwner(user, exam); // owning teacher only (test e)
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
    // Re-check the offering part/offering are still live at publish time (integrity guard).
    await this.access.loadActiveOfferingPart(exam.offeringPartPublicId);

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
              select: { text: true, isCorrect: true, order: true },
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
                ? (eq.question.options as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
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
}
