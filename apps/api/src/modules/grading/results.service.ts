import { Injectable, Logger } from '@nestjs/common';
import type { ExamStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Dense-rank all results for an exam by finalScore (ties share a rank) — a Postgres window fn. */
  async rerank(examId: number): Promise<void> {
    await this.prisma.$executeRaw`
      WITH ranked AS (
        SELECT er.id, DENSE_RANK() OVER (ORDER BY er."finalScore" DESC) AS rnk
        FROM "ExamResult" er
        JOIN "ExamAttempt" a ON a.id = er."attemptId"
        WHERE a."examId" = ${examId}
      )
      UPDATE "ExamResult" er
      SET rank = ranked.rnk, "updatedAt" = now()
      FROM ranked
      WHERE er.id = ranked.id;`;
  }

  /**
   * Auto-transition to results_published once the exam has ended and every attempt is graded.
   * ended → grading → results_published, each audited with a system actor. Idempotent.
   */
  async maybePublishResults(examId: number): Promise<void> {
    const exam = await this.prisma.db.exam.findUnique({
      where: { id: examId },
      select: { id: true, publicId: true, status: true },
    });
    if (!exam) return;
    if (exam.status !== 'ended' && exam.status !== 'grading') return;

    const ungraded = await this.prisma.db.examAttempt.count({
      where: { examId, gradingStatus: { not: 'graded' } },
    });
    if (ungraded > 0) return;

    await this.transition(exam.id, exam.publicId, 'ended', 'grading', 'exam.start_grading');
    await this.transition(
      exam.id,
      exam.publicId,
      'grading',
      'results_published',
      'exam.publish_results',
    );
    this.logger.log(`Exam ${exam.publicId} auto-published results (all attempts graded)`);
  }

  private async transition(
    examId: number,
    publicId: string,
    from: ExamStatus,
    to: ExamStatus,
    action: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.exam.updateMany({
        where: { id: examId, status: from },
        data: { status: to },
      });
      if (res.count > 0) {
        await this.audit.recordTx(tx, {
          actorUserId: null,
          action,
          entity: 'Exam',
          entityId: publicId,
          before: { status: from },
          after: { status: to },
        });
      }
    });
  }
}
