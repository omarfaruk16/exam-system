import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import ExcelJS from 'exceljs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImportRowError, ImportSummary } from '@exam/types';
import type { Env } from '../../common/config/env.validation';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QUEUE_QUESTION_IMPORT } from '../../queue/queue.constants';
import {
  validateMcqRow,
  validateWrittenRow,
  type ParsedMcqRow,
  type ParsedWrittenRow,
} from './question-row';

export interface QuestionImportJobData {
  filePath: string;
  originalName: string;
  bankId: number;
  uploadedByUserId: number;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString();
    const o = v as unknown as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    if ('result' in o) return String(o.result ?? '');
    if (Array.isArray(o.richText))
      return o.richText.map((r) => (r as { text: string }).text).join('');
    return String(v);
  }
  return String(v);
}

/** Reads rows from a named sheet into `{ header: value }` records.
 *  Uses eachRow (not ws.rowCount) because Excel/Google Sheets files often
 *  omit the <dimension> tag, making rowCount report 0. */
function readSheet(ws: ExcelJS.Worksheet): Record<string, unknown>[] {
  const headers: string[] = [];
  const rows: Record<string, unknown>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (headers.length === 0) {
      row.eachCell({ includeEmpty: true }, (c, col) => {
        headers[col] = cellText(c.value).trim().toLowerCase();
      });
      return;
    }
    const data: Record<string, unknown> = { __row: rowNumber };
    row.eachCell({ includeEmpty: true }, (c, col) => {
      const h = headers[col];
      if (h) data[h] = cellText(c.value);
    });
    if (Object.keys(data).length > 1) rows.push(data);
  });
  return rows;
}

/** Excel question import: MCQ + Written sheets, row-level validation, error report. */
@Processor(QUEUE_QUESTION_IMPORT, { concurrency: 1 })
export class QuestionImportProcessor extends WorkerHost {
  private readonly logger = new Logger(QuestionImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async process(job: Job<QuestionImportJobData>): Promise<ImportSummary> {
    const { filePath, bankId } = job.data;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);

    const mcqSheet = wb.worksheets.find((w) => w.name.trim().toLowerCase() === 'mcq');
    const writtenSheet = wb.worksheets.find((w) => w.name.trim().toLowerCase() === 'written');
    if (!mcqSheet && !writtenSheet) {
      throw new Error('Workbook must contain an "MCQ" and/or a "Written" sheet');
    }

    const errors: ImportRowError[] = [];
    const parsed: (ParsedMcqRow | ParsedWrittenRow)[] = [];

    if (mcqSheet) {
      for (const raw of readSheet(mcqSheet)) {
        const r = Number(raw.__row);
        const { value, error } = validateMcqRow(raw, r);
        if (error) errors.push({ ...error, message: `MCQ: ${error.message}` });
        else if (value) parsed.push(value);
      }
    }
    if (writtenSheet) {
      for (const raw of readSheet(writtenSheet)) {
        const r = Number(raw.__row);
        const { value, error } = validateWrittenRow(raw, r);
        if (error) errors.push({ ...error, message: `Written: ${error.message}` });
        else if (value) parsed.push(value);
      }
    }

    const validationErrors = errors.length;
    let imported = 0;
    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i]!;
      try {
        await this.prisma.$transaction(async (tx) => {
          const created = await tx.question.create({
            data: {
              bankId,
              type: q.type,
              text: q.text,
              marks: q.marks,
              explanation: q.type === 'mcq' ? q.explanation : null,
              modelAnswer: q.type === 'written' ? q.modelAnswer : null,
            },
          });
          if (q.type === 'mcq') {
            await tx.questionOption.createMany({
              data: q.options.map((o) => ({
                questionId: created.id,
                text: o.text,
                isCorrect: o.isCorrect,
                order: o.order,
              })),
            });
          }
        });
        imported++;
      } catch (e) {
        errors.push({
          row: 0,
          message: `Failed to import a ${q.type} question: ${(e as Error).message}`,
        });
      }
    }
    await job.updateProgress(100);

    const total = parsed.length + validationErrors;
    const summary: ImportSummary = {
      total,
      imported,
      skipped: 0,
      failed: total - imported,
      errors,
    };
    if (errors.length > 0) await this.writeErrorReport(String(job.id), errors);
    this.logger.log(
      `Question import ${job.id}: ${imported}/${total} imported, ${summary.failed} failed`,
    );
    return summary;
  }

  private async writeErrorReport(jobId: string, errors: ImportRowError[]): Promise<void> {
    const dir = join(this.config.getOrThrow('STORAGE_DIR', { infer: true }), 'imports');
    await mkdir(dir, { recursive: true });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Errors');
    ws.columns = [
      { header: 'Row', key: 'row', width: 8 },
      { header: 'Field', key: 'field', width: 16 },
      { header: 'Value', key: 'value', width: 24 },
      { header: 'Message', key: 'message', width: 70 },
    ];
    for (const e of errors)
      ws.addRow({ row: e.row, field: e.field ?? '', value: e.value ?? '', message: e.message });
    await wb.xlsx.writeFile(join(dir, `${jobId}-errors.xlsx`));
  }
}
