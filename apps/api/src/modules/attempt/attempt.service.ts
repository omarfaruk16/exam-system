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

  private async requireStudent(user: AuthUser): Promise<{ id: number; batchId: number }> {
    const student = await this.prisma.db.student.findFirst({
      where: { userId: user.id },
      select: { id: true, batchId: true },
    });
    if (!student) throw new ForbiddenException('Only a student can take an exam');
    return student;
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
        endAt: true,
        settings: true,
        offeringPart: { select: { offering: { select: { batchId: true } } } },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    if (exam.status !== 'live') throw new ForbiddenException('This exam is not currently open');
    if (student.batchId !== exam.offeringPart.offering.batchId) {
      throw new ForbiddenException('You are not enrolled in this exam');
    }

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
        student: { select: { userId: true } },
        exam: { select: { status: true, settings: true, totalMarks: true } },
        result: { select: { finalScore: true, percentage: true } },
        answers: {
          select: { questionId: true, selectedOptionId: true, writtenText: true, autoScore: true },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    const isOwner = attempt.student.userId === user.id;
    const isStaff = user.roles.some((r) => ['admin', 'super_admin', 'teacher'].includes(r.role));
    if (!isOwner && !isStaff) throw new ForbiddenException('Not your result');

    const settings = (attempt.exam.settings as ExamSettings) ?? {};
    // Server-enforced gate: students can't see marks early unless results are published.
    if (
      isOwner &&
      settings.showMarksAfterSubmit === false &&
      attempt.exam.status !== 'results_published'
    ) {
      throw new ForbiddenException('Results are not yet published');
    }

    const eqs = await this.prisma.db.examQuestion.findMany({
      where: { examId: attempt.examId },
      select: {
        questionId: true,
        order: true,
        snapshotType: true,
        snapshotMarks: true,
        snapshotExplanation: true,
        snapshotCorrectOptionId: true,
        question: { select: { publicId: true } },
      },
      orderBy: { order: 'asc' },
    });
    const answerByQ = new Map(attempt.answers.map((a) => [a.questionId, a]));

    const questions = eqs.map((eq) => {
      const a = answerByQ.get(eq.questionId);
      return {
        questionPublicId: eq.question.publicId,
        type: eq.snapshotType,
        marks: eq.snapshotMarks,
        autoScore: a?.autoScore ?? null,
        selectedOptionId: a?.selectedOptionId ?? null,
        writtenText: a?.writtenText ?? null,
        correctOptionId: eq.snapshotType === 'mcq' ? eq.snapshotCorrectOptionId : null,
        explanation: settings.showExplanation ? eq.snapshotExplanation : null,
      };
    });

    return {
      attemptPublicId: attempt.publicId,
      status: attempt.status,
      gradingStatus: attempt.gradingStatus,
      autoSubmitted: attempt.autoSubmitted,
      submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
      totalScore: attempt.totalScore,
      totalMarks: attempt.exam.totalMarks,
      percentage: attempt.result?.percentage ?? null,
      questions,
    };
  }
}
