import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
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
    const ctx = await this.access.requireAuthorablePartAny(user, dto.coursePartPublicId);
    if (ctx.teacherId == null) {
      throw new BadRequestException(
        'No teacher is assigned to this course part. Assign a teacher before creating a question bank.',
      );
    }
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
    // Assigned teacher, or an admin / super_admin / department_head in scope.
    await this.access.requireAuthorablePartAny(user, coursePartPublicId);
    return this.prisma.db.questionBank.findMany({
      where: { coursePart: { publicId: coursePartPublicId } },
      select: questionBankSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Resolve a bank the current teacher may author into (for the Excel import endpoint). */
  async requireAuthorableBank(user: AuthUser, bankPublicId: string): Promise<number> {
    const bank = await this.prisma.db.questionBank.findFirst({
      where: { publicId: bankPublicId },
      select: { id: true, coursePart: { select: { publicId: true } } },
    });
    if (!bank) throw new NotFoundException('Question bank not found');
    await this.access.requireAuthorablePartAny(user, bank.coursePart.publicId);
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
    await this.access.requireAuthorablePartAny(user, partPublicId);
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
    await this.access.requireAuthorablePartAny(user, partPublicId);
    return this.prisma.db.question.findMany({
      where: { bank: { publicId: bankPublicId } },
      select: questionSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  async listQuestionsByPart(user: AuthUser, coursePartPublicId: string) {
    await this.access.requireAuthorablePartAny(user, coursePartPublicId);
    return this.prisma.db.question.findMany({
      where: {
        bank: { coursePart: { publicId: coursePartPublicId }, deletedAt: null },
        deletedAt: null,
      },
      select: questionSelect,
      orderBy: [{ bank: { createdAt: 'asc' } }, { createdAt: 'asc' }],
    });
  }

  // ─────────────────────────── Export / Template ───────────────────────────

  private buildWorkbook(
    mcqRows: {
      text: string;
      marks: number;
      options: { text: string; isCorrect: boolean; order: number }[];
      explanation: string | null;
    }[],
    writtenRows: { text: string; marks: number; modelAnswer: string | null }[],
  ): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Exam System';

    // ── MCQ sheet ──
    const mcq = wb.addWorksheet('MCQ');
    mcq.columns = [
      { header: 'question', key: 'question', width: 60 },
      { header: 'marks', key: 'marks', width: 8 },
      { header: 'optionA', key: 'optionA', width: 30 },
      { header: 'optionB', key: 'optionB', width: 30 },
      { header: 'optionC', key: 'optionC', width: 30 },
      { header: 'optionD', key: 'optionD', width: 30 },
      { header: 'optionE', key: 'optionE', width: 30 },
      { header: 'correct', key: 'correct', width: 10 },
      { header: 'explanation', key: 'explanation', width: 50 },
    ];
    const letters = ['A', 'B', 'C', 'D', 'E'];
    for (const q of mcqRows) {
      const sorted = [...q.options].sort((a, b) => a.order - b.order);
      const correctIdx = sorted.findIndex((o) => o.isCorrect);
      const row: Record<string, string | number> = {
        question: q.text,
        marks: q.marks,
        correct: letters[correctIdx] ?? 'A',
        explanation: q.explanation ?? '',
      };
      sorted.forEach((o, i) => {
        row[`option${letters[i]}`] = o.text;
      });
      mcq.addRow(row);
    }
    // Style header row
    mcq.getRow(1).font = { bold: true };
    mcq.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E8FF' },
    };

    // ── Written sheet ──
    const written = wb.addWorksheet('Written');
    written.columns = [
      { header: 'question', key: 'question', width: 60 },
      { header: 'marks', key: 'marks', width: 8 },
      { header: 'modelAnswer', key: 'modelAnswer', width: 60 },
    ];
    for (const q of writtenRows) {
      written.addRow({ question: q.text, marks: q.marks, modelAnswer: q.modelAnswer ?? '' });
    }
    written.getRow(1).font = { bold: true };
    written.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFE0D0' },
    };

    return wb;
  }

  /** Build and return a blank template workbook (no question rows). */
  async templateBuffer(): Promise<{ buffer: Buffer; filename: string }> {
    const wb = this.buildWorkbook([], []);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, filename: 'question_template.xlsx' };
  }

  /** Export all questions in a bank as an xlsx workbook. */
  async exportQuestions(
    user: AuthUser,
    bankPublicId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const partPublicId = await this.bankPartPublicId(bankPublicId);
    await this.access.requireAuthorablePartAny(user, partPublicId);

    const bank = await this.prisma.db.questionBank.findFirstOrThrow({
      where: { publicId: bankPublicId },
      select: { name: true },
    });

    const questions = await this.prisma.db.question.findMany({
      where: { bank: { publicId: bankPublicId }, deletedAt: null },
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
      orderBy: { createdAt: 'asc' },
    });

    const mcqRows = questions.filter((q) => q.type === 'mcq') as typeof questions;
    const writtenRows = questions.filter((q) => q.type === 'written') as typeof questions;

    const wb = this.buildWorkbook(mcqRows, writtenRows);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const safeName = bank.name.replace(/[^a-z0-9]/gi, '_');
    return { buffer, filename: `${safeName}_questions.xlsx` };
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
    await this.access.requireAuthorablePartAny(user, question.bank.coursePart.publicId);

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
