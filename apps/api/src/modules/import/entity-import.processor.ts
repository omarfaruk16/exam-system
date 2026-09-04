import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Job } from 'bullmq';
import ExcelJS from 'exceljs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImportRowError, ImportSummary } from '@exam/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Env } from '../../common/config/env.validation';
import { PasswordService } from '../auth/password.service';
import { QUEUE_ENTITY_IMPORT } from '../../queue/queue.constants';
import { readImportRows } from './import-file';
import {
  validateCourseRow,
  validateDepartmentRow,
  validateFacultyRow,
  validateSemesterRow,
  validateTeacherRow,
} from './entity-rows';
import type { EntityImportJobData } from './import.types';

/**
 * Generic BullMQ worker for bulk teacher/department/course imports.
 * Same contract as the student import: valid rows import, rejected rows land in an error report,
 * progress is reported via jobId. Never runs on the request thread.
 */
@Processor(QUEUE_ENTITY_IMPORT, { concurrency: 1 })
export class EntityImportProcessor extends WorkerHost {
  private readonly logger = new Logger(EntityImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async process(job: Job<EntityImportJobData>): Promise<ImportSummary> {
    const rows = await readImportRows(job.data.filePath, job.data.originalName);
    switch (job.data.entity) {
      case 'teachers':
        return this.importTeachers(job, rows);
      case 'departments':
        return this.importDepartments(job, rows);
      case 'courses':
        return this.importCourses(job, rows);
      case 'faculties':
        return this.importFaculties(job, rows);
      case 'semesters':
        return this.importSemesters(job, rows);
    }
  }

  // ─────────────────────────────── Faculties ───────────────────────────────
  private async importFaculties(
    job: Job<EntityImportJobData>,
    rows: Awaited<ReturnType<typeof readImportRows>>,
  ): Promise<ImportSummary> {
    const errors: ImportRowError[] = [];
    const parsed = [];
    for (const { rowNumber, cells } of rows) {
      const { value, error } = validateFacultyRow(cells, rowNumber);
      if (error) errors.push(error);
      else if (value) parsed.push(value);
    }
    const validationErrors = errors.length;

    let imported = 0;
    let skipped = 0;
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i]!;
      try {
        // Idempotent: skip (not an error) if a faculty with this name already exists.
        const existing = await this.prisma.db.faculty.findFirst({
          where: { name: row.name },
          select: { id: true },
        });
        if (existing) {
          skipped++;
          continue;
        }
        await this.prisma.db.faculty.create({ data: { name: row.name } });
        imported++;
      } catch (e) {
        errors.push({ row: row.rowNumber, message: `Unexpected error: ${(e as Error).message}` });
      }
      await job.updateProgress(Math.round(((i + 1) / Math.max(parsed.length, 1)) * 100));
    }
    return this.finish(job, parsed.length + validationErrors, imported, skipped, errors);
  }

  // ─────────────────────────────── Semesters ───────────────────────────────
  private async importSemesters(
    job: Job<EntityImportJobData>,
    rows: Awaited<ReturnType<typeof readImportRows>>,
  ): Promise<ImportSummary> {
    const errors: ImportRowError[] = [];
    const parsed = [];
    for (const { rowNumber, cells } of rows) {
      const { value, error } = validateSemesterRow(cells, rowNumber);
      if (error) errors.push(error);
      else if (value) parsed.push(value);
    }
    const validationErrors = errors.length;

    let imported = 0;
    let skipped = 0;
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i]!;
      try {
        const batch = await this.prisma.db.batch.findFirst({
          where: { name: row.batchName, program: { name: row.programName } },
          select: { id: true },
        });
        if (!batch) {
          skipped++;
          errors.push({
            row: row.rowNumber,
            field: 'batch',
            value: `${row.programName} / ${row.batchName}`,
            message: 'Batch not found for that program',
          });
          continue;
        }
        // Idempotent: skip if this batch already has a semester with that number.
        const existing = await this.prisma.db.semester.findFirst({
          where: { batchId: batch.id, number: row.number },
          select: { id: true },
        });
        if (existing) {
          skipped++;
          continue;
        }
        await this.prisma.db.semester.create({
          data: { batchId: batch.id, number: row.number, name: row.name },
        });
        imported++;
      } catch (e) {
        errors.push({ row: row.rowNumber, message: `Unexpected error: ${(e as Error).message}` });
      }
      await job.updateProgress(Math.round(((i + 1) / Math.max(parsed.length, 1)) * 100));
    }
    return this.finish(job, parsed.length + validationErrors, imported, skipped, errors);
  }

  // ─────────────────────────────── Teachers ───────────────────────────────
  private async importTeachers(
    job: Job<EntityImportJobData>,
    rows: Awaited<ReturnType<typeof readImportRows>>,
  ): Promise<ImportSummary> {
    const errors: ImportRowError[] = [];
    const parsed = [];
    const seen = new Set<string>();
    for (const { rowNumber, cells } of rows) {
      const { value, error } = validateTeacherRow(cells, rowNumber);
      if (error) errors.push(error);
      else if (value) {
        if (seen.has(value.username.toLowerCase())) {
          errors.push({
            row: rowNumber,
            field: 'username',
            value: value.username,
            message: 'Duplicate username in file',
          });
        } else {
          seen.add(value.username.toLowerCase());
          parsed.push(value);
        }
      }
    }
    const validationErrors = errors.length;

    const teacherRole = await this.prisma.db.role.findUnique({ where: { name: 'teacher' } });
    if (!teacherRole) throw new Error('Role "teacher" is missing — run the seed first');

    let imported = 0;
    let skipped = 0;
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i]!;
      try {
        const dept = await this.resolveDepartment(row.departmentName);
        if (!dept) {
          skipped++;
          errors.push({
            row: row.rowNumber,
            field: 'department',
            value: row.departmentName,
            message: 'Department not found',
          });
          continue;
        }
        // Free the username slot if a soft-deleted user previously held it.
        const staleUser = await this.prisma.user.findFirst({
          where: { username: row.username, deletedAt: { not: null } },
          select: { id: true },
        });
        if (staleUser) {
          await this.prisma.user.update({
            where: { id: staleUser.id },
            data: { username: `${row.username}__del_${Date.now()}`, email: null },
          });
        }
        const tempPassword = `${row.username}@Exam123`;
        const hash = await this.password.hash(tempPassword);
        await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              username: row.username,
              email: row.email,
              passwordHash: hash,
              displayName: row.name,
              mustChangePassword: true,
            },
          });
          await tx.teacher.create({
            data: { userId: user.id, departmentId: dept.id, designation: row.designation },
          });
          await tx.userRole.create({
            data: { userId: user.id, roleId: teacherRole.id, scopeDepartmentId: dept.id },
          });
        });
        imported++;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          skipped++;
          errors.push({
            row: row.rowNumber,
            field: 'username',
            value: row.username,
            message: 'A user with this username or email already exists',
          });
        } else {
          errors.push({ row: row.rowNumber, message: `Unexpected error: ${(e as Error).message}` });
        }
      }
      await job.updateProgress(Math.round(((i + 1) / Math.max(parsed.length, 1)) * 100));
    }
    return this.finish(job, parsed.length + validationErrors, imported, skipped, errors);
  }

  // ─────────────────────────────── Departments ───────────────────────────────
  private async importDepartments(
    job: Job<EntityImportJobData>,
    rows: Awaited<ReturnType<typeof readImportRows>>,
  ): Promise<ImportSummary> {
    const errors: ImportRowError[] = [];
    const parsed = [];
    for (const { rowNumber, cells } of rows) {
      const { value, error } = validateDepartmentRow(cells, rowNumber);
      if (error) errors.push(error);
      else if (value) parsed.push(value);
    }
    const validationErrors = errors.length;

    let imported = 0;
    let skipped = 0;
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i]!;
      try {
        const faculty = await this.resolveFaculty(row.facultyName);
        if (!faculty) {
          skipped++;
          errors.push({
            row: row.rowNumber,
            field: 'faculty',
            value: row.facultyName,
            message: 'Faculty not found',
          });
          continue;
        }
        // Idempotent: skip (not an error) if a department with this name exists in the faculty.
        const existing = await this.prisma.db.department.findFirst({
          where: { facultyId: faculty.id, name: row.name },
          select: { id: true },
        });
        if (existing) {
          skipped++;
          continue;
        }
        await this.prisma.db.department.create({
          data: { facultyId: faculty.id, name: row.name },
        });
        imported++;
      } catch (e) {
        errors.push({ row: row.rowNumber, message: `Unexpected error: ${(e as Error).message}` });
      }
      await job.updateProgress(Math.round(((i + 1) / Math.max(parsed.length, 1)) * 100));
    }
    return this.finish(job, parsed.length + validationErrors, imported, skipped, errors);
  }

  // ─────────────────────────────── Courses ───────────────────────────────
  private async importCourses(
    job: Job<EntityImportJobData>,
    rows: Awaited<ReturnType<typeof readImportRows>>,
  ): Promise<ImportSummary> {
    const errors: ImportRowError[] = [];
    const parsed = [];
    for (const { rowNumber, cells } of rows) {
      const { value, error } = validateCourseRow(cells, rowNumber);
      if (error) errors.push(error);
      else if (value) parsed.push(value);
    }
    const validationErrors = errors.length;

    let imported = 0;
    let skipped = 0;
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i]!;
      try {
        const semester = await this.resolveSemester(
          row.semesterId,
          row.semesterNumber,
          row.programName,
          row.batchName,
        );
        if (!semester) {
          skipped++;
          errors.push({
            row: row.rowNumber,
            field: 'semesterId',
            message: 'Semester not found (check semesterId or semesterNumber + program + batch)',
          });
          continue;
        }
        const existing = await this.prisma.db.course.findFirst({
          where: { semesterId: semester.id, code: row.code },
          select: { id: true },
        });
        if (existing) {
          skipped++;
          continue;
        }
        await this.prisma.db.course.create({
          data: { semesterId: semester.id, code: row.code, name: row.name, credit: row.credit },
        });
        imported++;
      } catch (e) {
        errors.push({ row: row.rowNumber, message: `Unexpected error: ${(e as Error).message}` });
      }
      await job.updateProgress(Math.round(((i + 1) / Math.max(parsed.length, 1)) * 100));
    }
    return this.finish(job, parsed.length + validationErrors, imported, skipped, errors);
  }

  // ─────────────────────────────── lookups ───────────────────────────────
  private resolveDepartment(name: string) {
    return this.prisma.db.department.findFirst({ where: { name }, select: { id: true } });
  }
  private resolveFaculty(name: string) {
    return this.prisma.db.faculty.findFirst({ where: { name }, select: { id: true } });
  }
  private async resolveSemester(
    id: number | null,
    number: number | null,
    programName: string | null,
    batchName: string | null,
  ) {
    if (id) return this.prisma.db.semester.findFirst({ where: { id }, select: { id: true } });
    if (number && programName && batchName) {
      const batch = await this.prisma.db.batch.findFirst({
        where: { name: batchName, program: { name: programName } },
        select: { id: true },
      });
      if (!batch) return null;
      return this.prisma.db.semester.findFirst({
        where: { batchId: batch.id, number },
        select: { id: true },
      });
    }
    return null;
  }

  private async finish(
    job: Job<EntityImportJobData>,
    total: number,
    imported: number,
    skipped: number,
    errors: ImportRowError[],
  ): Promise<ImportSummary> {
    const summary: ImportSummary = {
      total,
      imported,
      skipped,
      failed: total - imported - skipped,
      errors,
    };
    if (errors.length > 0) await this.writeErrorReport(String(job.id), errors);
    this.logger.log(
      `Entity import ${job.id} (${job.data.entity}): ${imported} imported, ${skipped} skipped, ${summary.failed} failed of ${total}`,
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
      { header: 'Field', key: 'field', width: 18 },
      { header: 'Value', key: 'value', width: 24 },
      { header: 'Message', key: 'message', width: 60 },
    ];
    for (const e of errors)
      ws.addRow({ row: e.row, field: e.field ?? '', value: e.value ?? '', message: e.message });
    const safeId = jobId.replace(/[^A-Za-z0-9_-]/g, '');
    await wb.xlsx.writeFile(join(dir, `${safeId}-errors.xlsx`));
  }
}
