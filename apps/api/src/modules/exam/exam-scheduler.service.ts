import { Injectable, Logger } from '@nestjs/common';
import type { ExamStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Drives the time-based exam transitions: published→live at startAt, live→ended at endAt.
 * Called on a schedule (BullMQ repeatable job) and directly in tests. Idempotent and race-safe:
 * the status is guarded in the UPDATE, so a double-fire never double-transitions.
 */
@Injectable()
export class ExamSchedulerService {
  private readonly logger = new Logger(ExamSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
    await this.prisma.$transaction(async (tx) => {
      // Guarded update: only transitions if still in `from` (safe under concurrent sweeps).
      const res = await tx.exam.updateMany({
        where: { id: exam.id, status: from },
        data: { status: to },
      });
      if (res.count > 0) {
        await this.audit.recordTx(tx, {
          actorUserId: null, // system actor
          action,
          entity: 'Exam',
          entityId: exam.publicId,
          before: { status: from },
          after: { status: to },
        });
      }
    });
  }
}
