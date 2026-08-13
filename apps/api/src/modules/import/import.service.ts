import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { ImportJobState, ImportJobStatus, ImportSummary } from '@exam/types';
import { QUEUE_STUDENT_IMPORT } from '../../queue/queue.constants';
import type { StudentImportJobData } from './import.types';

@Injectable()
export class ImportService {
  constructor(
    @InjectQueue(QUEUE_STUDENT_IMPORT) private readonly queue: Queue<StudentImportJobData>,
  ) {}

  async enqueueStudentImport(data: StudentImportJobData): Promise<string> {
    const job = await this.queue.add('import', data);
    return String(job.id);
  }

  async getJobState(jobId: string): Promise<ImportJobState> {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new NotFoundException('Import job not found');

    const state = await job.getState();
    const progress = typeof job.progress === 'number' ? job.progress : 0;
    const summary = job.returnvalue as ImportSummary | undefined;

    return {
      jobId,
      status: this.mapStatus(state),
      progress,
      summary,
      message: job.failedReason,
    };
  }

  private mapStatus(state: string): ImportJobStatus {
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
