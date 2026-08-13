import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QUEUE_ATTEMPT_SWEEP } from '../../queue/queue.constants';
import { AttemptFinalizeService } from './attempt-finalize.service';

/**
 * Auto-submit safety net (§6.5). A repeatable job finds in-progress attempts whose deadline has
 * passed and finalizes them through the SAME idempotent path (auto=true) — not a separate one.
 * (Restart-safe; recomputes the deadline from the DB, independent of the Redis key.)
 */
@Processor(QUEUE_ATTEMPT_SWEEP)
export class AttemptSweepProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AttemptSweepProcessor.name);

  constructor(
    @InjectQueue(QUEUE_ATTEMPT_SWEEP) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly finalize: AttemptFinalizeService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'sweep',
      {},
      {
        repeat: { every: 30_000 },
        jobId: 'attempt-sweep',
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  async process(): Promise<{ finalized: number }> {
    const now = Date.now();
    const candidates = await this.prisma.db.examAttempt.findMany({
      where: { status: 'in_progress' },
      select: {
        publicId: true,
        startedAt: true,
        exam: { select: { endAt: true, durationMinutes: true } },
      },
    });
    let finalized = 0;
    for (const a of candidates) {
      const deadline = Math.min(
        a.exam.endAt.getTime(),
        a.startedAt.getTime() + a.exam.durationMinutes * 60_000,
      );
      if (now > deadline) {
        await this.finalize.finalize(a.publicId, { auto: true }).catch((e) => {
          this.logger.warn(`Auto-submit failed for ${a.publicId}: ${(e as Error).message}`);
        });
        finalized++;
      }
    }
    if (finalized) this.logger.log(`Auto-submit sweep finalized ${finalized} attempt(s)`);
    return { finalized };
  }
}
