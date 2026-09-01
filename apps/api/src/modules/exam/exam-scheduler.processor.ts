import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_EXAM_SCHEDULER } from '../../queue/queue.constants';
import { ExamSchedulerService } from './exam-scheduler.service';

/** BullMQ repeatable job (every minute) that runs the exam status sweep. */
@Processor(QUEUE_EXAM_SCHEDULER)
export class ExamSchedulerProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ExamSchedulerProcessor.name);

  constructor(
    @InjectQueue(QUEUE_EXAM_SCHEDULER) private readonly queue: Queue,
    private readonly scheduler: ExamSchedulerService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // Fixed jobId dedups across instances — only one repeatable schedule ever exists.
    // Sweep every 15s so a published→live flip lands within ~15s of startAt. The
    // student's start() call also flips it lazily, so the sweep is mostly a safety net.
    await this.queue.add(
      'sweep',
      {},
      { repeat: { every: 15_000 }, jobId: 'exam-sweep', removeOnComplete: true, removeOnFail: 100 },
    );
    this.logger.log('Exam scheduler repeatable job registered (every 15s)');
  }

  async process(): Promise<{ toLive: number; toEnded: number }> {
    return this.scheduler.runSweep();
  }
}
