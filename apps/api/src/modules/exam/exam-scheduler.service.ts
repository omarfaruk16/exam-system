import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { ExamStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QUEUE_RESULTS } from '../../queue/queue.constants';
import { AuditService } from '../audit/audit.service';

/**
 * Drives the time-based exam transitions: published→live at startAt, live→ended at endAt.
 * When an exam ends, it enqueues the results-finalize job (rerank + maybe auto-publish results).
 * Called on a schedule (BullMQ repeatable job) and directly in tests. Race-safe.
 */
@Injectable()
export class ExamSchedulerService {
  private readonly logger = new Logger(ExamSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUE_RESULTS) private readonly resultsQueue: Queue,
  ) {}

  async runSweep(now: Date = new Date()): Promise<{ toLive: number; toEnded: number }> {
    const toLive = await this.prisma.db.exam.findMany({
      where: { status: 'published', startAt: { lte: now } },
      select: { id: true, publicId: true },
    });
    for (const e of toLive) await this.advance(e, 'published', 'live', 'exam.auto_live');

    const toEnded = await this.prisma.db.exam.findMany({
      where: { status: 'live', endAt: { lte: now } },
      select: { id: true, publicId: true },
    });
    for (const e of toEnded) await this.advance(e, 'live', 'ended', 'exam.auto_ended');

    if (toLive.length || toEnded.length) {
      this.logger.log(`Exam sweep: ${toLive.length} → live, ${toEnded.length} → ended`);
    }
    return { toLive: toLive.length, toEnded: toEnded.length };
  }

  private async advance(
    exam: { id: number; publicId: string },
    from: ExamStatus,
    to: ExamStatus,
    action: string,
  ): Promise<void> {
    let transitioned = false;
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.exam.updateMany({
        where: { id: exam.id, status: from },
        data: { status: to },
      });
      if (res.count > 0) {
        transitioned = true;
        await this.audit.recordTx(tx, {
          actorUserId: null,
          action,
          entity: 'Exam',
          entityId: exam.publicId,
          before: { status: from },
          after: { status: to },
        });
      }
    });
    // A newly-ended exam may already have all attempts graded (e.g. MCQ-only) — finalize results.
    if (transitioned && to === 'ended') {
      await this.resultsQueue.add('finalize-exam', { examId: exam.id });
    }
  }
}
