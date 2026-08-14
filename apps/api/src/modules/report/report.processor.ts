import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Env } from '../../common/config/env.validation';
import { QUEUE_REPORT } from '../../queue/queue.constants';
import { ReportDataService } from './report-data.service';
import {
  writeIndividualExcel,
  writeIndividualPdf,
  writeOverallExcel,
  writeOverallPdf,
} from './report-render';

export interface ReportJobData {
  examId: number;
  examPublicId: string;
  type: 'overall' | 'individual';
  studentPublicId: string | null;
  requestedByUserId: number;
}

/** Generates both Excel (exceljs) and PDF (pdfkit) for a report, in a worker (never inline). */
@Processor(QUEUE_REPORT, { concurrency: 2 })
export class ReportProcessor extends WorkerHost {
  constructor(
    private readonly data: ReportDataService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async process(job: Job<ReportJobData>): Promise<{ formats: string[] }> {
    const dir = join(this.config.getOrThrow('STORAGE_DIR', { infer: true }), 'reports');
    await mkdir(dir, { recursive: true });
    const base = join(dir, String(job.id));

    if (job.data.type === 'overall') {
      const d = await this.data.buildOverall(job.data.examId);
      await writeOverallExcel(d, `${base}.xlsx`);
      await writeOverallPdf(d, `${base}.pdf`);
    } else {
      if (!job.data.studentPublicId)
        throw new Error('studentPublicId is required for an individual report');
      const d = await this.data.buildIndividual(job.data.examId, job.data.studentPublicId);
      await writeIndividualExcel(d, `${base}.xlsx`);
      await writeIndividualPdf(d, `${base}.pdf`);
    }
    return { formats: ['xlsx', 'pdf'] };
  }
}
