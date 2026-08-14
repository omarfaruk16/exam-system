import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUE_RESULTS } from '../../queue/queue.constants';
import { ResultsService } from './results.service';

/** Runs after each ExamResult write (and on live→ended): rerank + maybe auto-publish results. */
@Processor(QUEUE_RESULTS, { concurrency: 3 })
export class ResultsProcessor extends WorkerHost {
  constructor(private readonly results: ResultsService) {
    super();
  }

  async process(job: Job<{ examId: number }>): Promise<void> {
    await this.results.rerank(job.data.examId);
    await this.results.maybePublishResults(job.data.examId);
  }
}
