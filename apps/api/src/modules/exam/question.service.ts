import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth';
import { AuditService } from '../audit/audit.service';
import type {
  CreateQuestionBankDto,
  CreateQuestionDto,
  QuestionOptionInput,
  UpdateQuestionDto,
} from './dto/question.dto';
import { ExamAccessService } from './exam-access.service';
import { LOCKED_EXAM_STATUSES } from './exam-state';
import { questionBankSelect, questionSelect } from './exam.select';

@Injectable()
export class QuestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: ExamAccessService,
  ) {}

  /** MCQ: needs ≥2 options and exactly one correct. Written: options are ignored. */
  private validateShape(type: 'mcq' | 'written', options?: QuestionOptionInput[]): void {
    if (type === 'mcq') {
      if (!options || options.length < 2) {
        throw new BadRequestException('An MCQ needs at least two options');
      }
      const correct = options.filter((o) => o.isCorrect).length;
      if (correct !== 1) {
        throw new BadRequestException('An MCQ must have exactly one correct option');
      }
    }
  }

  // ─────────────────────────────── Question bank ───────────────────────────────
  async createBank(user: AuthUser, ip: string, dto: CreateQuestionBankDto) {
    const ctx = await this.access.requireAuthorablePart(user, dto.coursePartPublicId);
    return this.prisma.$transaction(async (tx) => {
      const bank = await tx.questionBank.create({
        data: {
          coursePartId: ctx.coursePartId,
          name: dto.name,
          createdByTeacherId: ctx.teacherId,
        },
        select: questionBankSelect,
      });
      await this.audit.recordTx(tx, {
        actorUserId: user.id,
        action: 'questionBank.create',
        entity: 'QuestionBank',
        entityId: bank.publicId,
        after: bank,
        ip,
      });
      return bank;
    });
  }

  /** All course parts in a department with their bank and question counts — for the dept profile tab. */
  async listBanksByDepartment(departmentPublicId: string) {
    const courses = await this.prisma.db.course.findMany({
      where: {
        deletedAt: null,
        semester: {
          deletedAt: null,
          program: { deletedAt: null, department: { publicId: departmentPublicId } },
        },
      },
      select: {
        code: true,
        name: true,
        semester: { select: { name: true, number: true } },
        parts: {
          where: { deletedAt: null },
          select: {
            publicId: true,
            name: true,
            questionBanks: {
              select: { _count: { select: { questions: true } } },
            },
          },
          orderBy: { createdAt: 'asc' as const },
        },
      },
      orderBy: [{ semester: { number: 'asc' as const } }, { code: 'asc' as const }],
    });

    const rows: {
      courseCode: string;
      courseName: string;
      semesterLabel: string;
      partPublicId: string;
      partName: string;
      bankCount: number;
      questionCount: number;
    }[] = [];

    for (const course of courses) {
      const semesterLabel = course.semester.name ?? `Semester ${course.semester.number}`;
      for (const part of course.parts) {
        rows.push({
          courseCode: course.code,
          courseName: course.name,
          semesterLabel,
          partPublicId: part.publicId,
          partName: part.name,
          bankCount: part.questionBanks.length,
          questionCount: part.questionBanks.reduce(
            (s: number, b: { _count: { questions: number } }) => s + b._count.questions,
            0,
          ),
        });
      }
    }
    return rows;
  }

  async listBanks(user: AuthUser, coursePartPublicId: string) {
    // Access check: teacher must be assigned (admins scoped) — reuse the authoring guard's read side.
    await this.access.requireAuthorablePart(user, coursePartPublicId).catch(async (e) => {
      // Admins aren't "assigned", so fall back to a scope check for them.
      const ctx = await this.access.loadActiveCoursePart(coursePartPublicId);
      if (this.isAdmin(user)) return this.access.assertAdminScope(user, ctx);
      throw e;
    });
    return this.prisma.db.questionBank.findMany({
      where: { coursePart: { publicId: coursePartPublicId } },
      select: questionBankSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  private isAdmin(user: AuthUser): boolean {
    return user.roles.some((r) => r.role === 'admin' || r.role === 'super_admin');
  }

  /** Resolve a bank the current teacher may author into (for the Excel import endpoint). */
  async requireAuthorableBank(user: AuthUser, bankPublicId: string): Promise<number> {
    const bank = await this.prisma.db.questionBank.findFirst({
      where: { publicId: bankPublicId },
      select: { id: true, coursePart: { select: { publicId: true } } },
    });
    if (!bank) throw new NotFoundException('Question bank not found');
    await this.access.requireAuthorablePart(user, bank.coursePart.publicId);
    return bank.id;
  }

  // ─────────────────────────────── Question ───────────────────────────────
  private async bankPartPublicId(bankPublicId: string): Promise<string> {
    const bank = await this.prisma.db.questionBank.findFirst({
      where: { publicId: bankPublicId },
      select: { coursePart: { select: { publicId: true } } },
    });
    if (!bank) throw new NotFoundException('Question bank not found');
    return bank.coursePart.publicId;
  }

  async createQuestion(user: AuthUser, ip: string, dto: CreateQuestionDto) {
    const partPublicId = await this.bankPartPublicId(dto.bankPublicId);
    await this.access.requireAuthorablePart(user, partPublicId);
    this.validateShape(dto.type, dto.options);

    const bank = await this.prisma.db.questionBank.findFirstOrThrow({
      where: { publicId: dto.bankPublicId },
      select: { id: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          bankId: bank.id,
          type: dto.type,
          text: dto.text,
          marks: dto.marks,
          explanation: dto.type === 'mcq' ? (dto.explanation ?? null) : null,
          modelAnswer: dto.type === 'written' ? (dto.modelAnswer ?? null) : null,
        },
      });
      if (dto.type === 'mcq' && dto.options) {
        await tx.questionOption.createMany({
          data: dto.options.map((o) => ({
            questionId: question.id,
            text: o.text,
            isCorrect: o.isCorrect,
            order: o.order,
          })),
        });
      }
      const full = await tx.question.findUniqueOrThrow({
        where: { id: question.id },
        select: questionSelect,
      });
      await this.audit.recordTx(tx, {
        actorUserId: user.id,
        action: 'question.create',
        entity: 'Question',
        entityId: question.publicId,
        after: { type: dto.type, marks: dto.marks },
        ip,
      });
      return full;
    });
  }

  async listQuestions(user: AuthUser, bankPublicId: string) {
    const partPublicId = await this.bankPartPublicId(bankPublicId);
    await this.access.requireAuthorablePart(user, partPublicId).catch(async (e) => {
      const ctx = await this.access.loadActiveCoursePart(partPublicId);
      if (this.isAdmin(user)) return this.access.assertAdminScope(user, ctx);
      throw e;
    });
    return this.prisma.db.question.findMany({
      where: { bank: { publicId: bankPublicId } },
      select: questionSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  async listQuestionsByPart(user: AuthUser, coursePartPublicId: string) {
    await this.access.requireAuthorablePart(user, coursePartPublicId).catch(async (e) => {
      const ctx = await this.access.loadActiveCoursePart(coursePartPublicId);
      if (this.isAdmin(user)) return this.access.assertAdminScope(user, ctx);
      throw e;
    });
    return this.prisma.db.question.findMany({
      where: {
        bank: { coursePart: { publicId: coursePartPublicId }, deletedAt: null },
        deletedAt: null,
      },
      select: questionSelect,
      orderBy: [{ bank: { createdAt: 'asc' } }, { createdAt: 'asc' }],
    });
  }

  async updateQuestion(user: AuthUser, ip: string, publicId: string, dto: UpdateQuestionDto) {
    const question = await this.prisma.db.question.findFirst({
      where: { publicId },
      select: {
        id: true,
        type: true,
        bank: { select: { coursePart: { select: { publicId: true } } } },
      },
    });
    if (!question) throw new NotFoundException('Question not found');
    await this.access.requireAuthorablePart(user, question.bank.coursePart.publicId);

    // EDIT-LOCK: a question used by a published/live (or later) exam is immutable.
    const locked = await this.prisma.db.examQuestion.findFirst({
      where: { question: { publicId }, exam: { status: { in: [...LOCKED_EXAM_STATUSES] } } },
      select: { id: true },
    });
    if (locked) {
      throw new BadRequestException(
        'This question is used in a published or live exam and can no longer be edited',
      );
    }

    if (dto.options !== undefined) this.validateShape(question.type, dto.options);

    return this.prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { publicId },
        data: {
          text: dto.text,
          marks: dto.marks,
          explanation: question.type === 'mcq' ? dto.explanation : undefined,
          modelAnswer: question.type === 'written' ? dto.modelAnswer : undefined,
        },
      });
      if (question.type === 'mcq' && dto.options !== undefined) {
        await tx.questionOption.deleteMany({ where: { questionId: question.id } });
        await tx.questionOption.createMany({
          data: dto.options.map((o) => ({
            questionId: question.id,
            text: o.text,
            isCorrect: o.isCorrect,
            order: o.order,
          })),
        });
      }
      const full = await tx.question.findUniqueOrThrow({
        where: { id: question.id },
        select: questionSelect,
      });
      await this.audit.recordTx(tx, {
        actorUserId: user.id,
        action: 'question.update',
        entity: 'Question',
        entityId: publicId,
        after: { text: dto.text, marks: dto.marks },
        ip,
      });
      return full;
    });
  }
}
