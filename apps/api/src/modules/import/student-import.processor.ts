import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Job } from 'bullmq';
import ExcelJS from 'exceljs';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImportRowError, ImportSummary } from '@exam/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Env } from '../../common/config/env.validation';
import { PasswordService } from '../auth/password.service';
import { QUEUE_STUDENT_IMPORT } from '../../queue/queue.constants';
import { readImportRows } from './import-file';
import { validateStudentRow, type ParsedStudentRow } from './student-row';
import type { StudentImportJobData } from './import.types';

function generateTempPassword(): string {
  // ~14 chars, url-safe. Users are forced to change it on first login.
  return randomBytes(11).toString('base64url');
}

/**
 * BullMQ worker for the bulk student import. Never runs on the request thread.
 * Valid rows are imported; malformed rows are rejected into a downloadable error report.
 * Temp passwords are generated when absent (mustChangePassword=true); delivery of credentials
 * via emailed reset links is added in a later phase — plaintext passwords are never persisted.
 */
@Processor(QUEUE_STUDENT_IMPORT, { concurrency: 1 })
export class StudentImportProcessor extends WorkerHost {
  private readonly logger = new Logger(StudentImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async process(job: Job<StudentImportJobData>): Promise<ImportSummary> {
    const { filePath, originalName, batchId } = job.data;

    const rows = await readImportRows(filePath, originalName ?? filePath);

    const parsed: ParsedStudentRow[] = [];
    const errors: ImportRowError[] = [];
    const seen = new Set<string>();

    for (const { rowNumber, cells } of rows) {
      const { value, error } = validateStudentRow(cells, rowNumber);
      if (error) {
        errors.push(error);
        continue;
      }
      if (value) {
        const key = value.studentId.toLowerCase();
        if (seen.has(key)) {
          errors.push({
            row: rowNumber,
            field: 'studentId',
            value: value.studentId,
            message: 'Duplicate student ID within the file',
          });
          continue;
        }
        seen.add(key);
        parsed.push(value);
      }
    }

    const studentRole = await this.prisma.role.findUnique({ where: { name: 'student' } });
    if (!studentRole) throw new Error('Role "student" is missing — run the seed first');

    const validationErrorCount = errors.length;
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i]!;
      const tempPassword = row.password ?? generateTempPassword();
      try {
        // Free unique slots held by any prior soft-deleted record with the same studentId.
        const staleUser = await this.prisma.user.findFirst({
          where: { username: row.studentId, deletedAt: { not: null } },
          select: { id: true },
        });
        if (staleUser) {
          await this.prisma.user.update({
            where: { id: staleUser.id },
            data: { username: `${row.studentId}__del_${Date.now()}`, email: null },
          });
        }
        const staleStudent = await this.prisma.student.findFirst({
          where: { studentId: row.studentId, deletedAt: { not: null } },
          select: { id: true },
        });
        if (staleStudent) {
          await this.prisma.student.update({
            where: { id: staleStudent.id },
            data: { studentId: `${row.studentId}__del_${Date.now()}`, registrationNumber: null },
          });
        }
        const hash = await this.password.hash(tempPassword);
        await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              username: row.studentId,
              email: row.email,
              passwordHash: hash,
              displayName: row.name,
              mustChangePassword: true,
            },
          });
          await tx.student.create({
            data: {
              userId: user.id,
              studentId: row.studentId,
              batchId,
              registrationNumber: row.registrationNumber ?? undefined,
            },
          });
          await tx.userRole.create({ data: { userId: user.id, roleId: studentRole.id } });
        });
        imported++;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          skipped++;
          errors.push({
            row: row.rowNumber,
            field: 'studentId',
            value: row.studentId,
            message: 'A user with this student ID or email already exists',
          });
        } else {
          errors.push({ row: row.rowNumber, message: `Unexpected error: ${(e as Error).message}` });
        }
      }
      await job.updateProgress(Math.round(((i + 1) / Math.max(parsed.length, 1)) * 100));
    }

    const total = parsed.length + validationErrorCount;
    const summary: ImportSummary = {
      total,
      imported,
      skipped,
      failed: total - imported - skipped,
      errors,
    };

    if (errors.length > 0) {
      await this.writeErrorReport(String(job.id), errors);
    }

    this.logger.log(
      `Import job ${job.id}: ${imported} imported, ${skipped} skipped, ${summary.failed} failed of ${total}`,
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
      { header: 'Message', key: 'message', width: 60 },
    ];
    for (const e of errors)
      ws.addRow({ row: e.row, field: e.field ?? '', value: e.value ?? '', message: e.message });
    await wb.xlsx.writeFile(join(dir, `${jobId}-errors.xlsx`));
  }
}
