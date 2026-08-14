import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QUEUE_RESULTS } from '../../queue/queue.constants';

/**
 * Finalizes an attempt's grade once every answer is scored (MCQ auto + written manual). Shared by
 * the MCQ grader (Phase 4) and the written-grading path. Writes the ExamResult rollup + per-question
 * breakdown and, when complete, enqueues the exam finalize job (rerank + auto results_published).
 */
@Injectable()
export class AttemptGradingService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_RESULTS) private readonly resultsQueue: Queue,
  ) {}

  async finalizeIfComplete(attemptId: number): Promise<void> {
    const attempt = await this.prisma.db.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        examId: true,
        exam: { select: { totalMarks: true } },
        answers: {
          select: { questionId: true, autoScore: true, manualScore: true, isGraded: true },
        },
      },
    });
    if (!attempt) return;

    const eqs = await this.prisma.db.examQuestion.findMany({
      where: { examId: attempt.examId },
      select: {
        questionId: true,
        order: true,
        snapshotType: true,
        snapshotMarks: true,
        question: { select: { publicId: true } },
      },
      orderBy: { order: 'asc' },
    });
    const answerByQ = new Map(attempt.answers.map((a) => [a.questionId, a]));

    // Any written answer still ungraded means the attempt isn't final yet.
    const pendingWritten = eqs.some((eq) => {
      if (eq.snapshotType !== 'written') return false;
      const a = answerByQ.get(eq.questionId);
      return a !== undefined && !a.isGraded;
    });

    if (pendingWritten) {
      const partial = attempt.answers.reduce(
        (s, a) => s + (a.autoScore ?? 0) + (a.manualScore ?? 0),
        0,
      );
      await this.prisma.db.examAttempt.update({
        where: { id: attemptId },
        data: { gradingStatus: 'awaiting_manual', totalScore: Math.max(0, partial) },
      });
      return;
    }

    // Fully graded: build the breakdown over ALL exam questions (blank answers score 0).
    let finalScore = 0;
    const breakdown = eqs.map((eq) => {
      const a = answerByQ.get(eq.questionId);
      const score = eq.snapshotType === 'mcq' ? (a?.autoScore ?? 0) : (a?.manualScore ?? 0);
      finalScore += score;
      return {
        questionPublicId: eq.question.publicId,
        order: eq.order,
        type: eq.snapshotType,
        score,
        maxMarks: eq.snapshotMarks ?? 0,
      };
    });
    finalScore = Math.max(0, finalScore);
    const percentage =
      attempt.exam.totalMarks > 0
        ? Math.min(100, Math.max(0, (finalScore / attempt.exam.totalMarks) * 100))
        : 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.examResult.upsert({
        where: { attemptId },
        create: {
          attemptId,
          finalScore,
          percentage,
          breakdown: breakdown as unknown as Prisma.InputJsonValue,
        },
        update: {
          finalScore,
          percentage,
          breakdown: breakdown as unknown as Prisma.InputJsonValue,
          computedAt: new Date(),
        },
      });
      await tx.examAttempt.update({
        where: { id: attemptId },
        data: { status: 'graded', gradingStatus: 'graded', totalScore: finalScore },
      });
    });

    // Rerank the exam + auto-publish results if every attempt is now graded.
    await this.resultsQueue.add('finalize-exam', { examId: attempt.examId });
  }
}
