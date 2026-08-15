import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { ImportJobState, ImportJobStatus, ImportSummary } from '@exam/types';
import { QUEUE_ENTITY_IMPORT, QUEUE_STUDENT_IMPORT } from '../../queue/queue.constants';
import type { EntityImportJobData, StudentImportJobData } from './import.types';

@Injectable()
export class ImportService {
  constructor(
    @InjectQueue(QUEUE_STUDENT_IMPORT) private readonly queue: Queue<StudentImportJobData>,
    @InjectQueue(QUEUE_ENTITY_IMPORT) private readonly entityQueue: Queue<EntityImportJobData>,
  ) {}

  async enqueueStudentImport(data: StudentImportJobData): Promise<string> {
    const job = await this.queue.add('import', data);
    return String(job.id);
  }

  async enqueueEntityImport(data: EntityImportJobData): Promise<string> {
    // UUID job id keeps entity jobs from colliding with the student queue's numeric ids.
    const jobId = `ent_${randomUUID()}`;
    const job = await this.entityQueue.add('import', data, { jobId });
    return String(job.id);
  }

  async getJobState(jobId: string): Promise<ImportJobState> {
    // A job id can belong to either queue; check the entity queue first, then students.
    const job = (await this.entityQueue.getJob(jobId)) ?? (await this.queue.getJob(jobId));
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
