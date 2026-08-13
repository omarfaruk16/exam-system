import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUE_GRADING } from '../../queue/queue.constants';
import { GradingService } from './grading.service';

@Processor(QUEUE_GRADING, { concurrency: 5 })
export class GradingProcessor extends WorkerHost {
  constructor(private readonly grading: GradingService) {
    super();
  }

  async process(job: Job<{ attemptId: number }>): Promise<void> {
    await this.grading.grade(job.data.attemptId);
  }
}
