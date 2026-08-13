import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { ImportJobState, ImportJobStatus, ImportSummary } from '@exam/types';
import { QUEUE_QUESTION_IMPORT } from '../../queue/queue.constants';
import type { QuestionImportJobData } from './question-import.processor';

@Injectable()
export class QuestionImportService {
  constructor(
    @InjectQueue(QUEUE_QUESTION_IMPORT) private readonly queue: Queue<QuestionImportJobData>,
  ) {}

  async enqueue(data: QuestionImportJobData): Promise<string> {
    const job = await this.queue.add('import', data);
    return String(job.id);
  }

  async getJobState(jobId: string): Promise<ImportJobState> {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new NotFoundException('Import job not found');
    const state = await job.getState();
    return {
      jobId,
      status: this.map(state),
      progress: typeof job.progress === 'number' ? job.progress : 0,
      summary: job.returnvalue as ImportSummary | undefined,
      message: job.failedReason,
    };
  }

  private map(state: string): ImportJobStatus {
    switch (state) {
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'active':
        return 'processing';
      default:
        return 'queued';
    }
  }
}
