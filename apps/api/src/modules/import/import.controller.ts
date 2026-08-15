import {
  BadRequestException,
  Controller,
  Get,
  Ip,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ImportJobState } from '@exam/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import type { Env } from '../../common/config/env.validation';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ImportService } from './import.service';
import { buildTemplate, isTemplateType } from './import-templates';
import type { ImportEntity, UploadedExcel } from './import.types';

@Controller('imports')
@Roles('admin', 'super_admin')
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ─────────────────────────── Templates ───────────────────────────
  /** Download a pre-formatted .xlsx template with headers + one example row. */
  @Get('templates/:type')
  async template(@Param('type') type: string, @Res() res: Response): Promise<void> {
    if (!isTemplateType(type)) throw new BadRequestException('Unknown template type');
    const buffer = await buildTemplate(type);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${type}-template.xlsx"`);
    res.end(buffer);
  }

  // ─────────────────────────── Students (batch roster) ───────────────────────────
  @Post('students')
  @UseInterceptors(FileInterceptor('file'))
  async uploadStudents(
    @UploadedFile() file: UploadedExcel | undefined,
    @Query('batch') batchPublicId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ jobId: string }> {
    if (!file) throw new BadRequestException('No file uploaded (field name must be "file")');
    if (!batchPublicId) throw new BadRequestException('A "batch" query parameter is required');

    const batch = await this.prisma.db.batch.findFirst({ where: { publicId: batchPublicId } });
    if (!batch) throw new NotFoundException('Batch not found');

    const jobId = await this.importService.enqueueStudentImport({
      filePath: file.path,
      originalName: file.originalname,
      batchId: batch.id,
      uploadedByUserId: user.id,
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'import.students.enqueue',
      entity: 'Batch',
      entityId: batch.id,
      ip,
      after: { file: file.originalname, jobId },
    });
    return { jobId };
  }

  // ─────────────────────────── Teachers / Departments / Courses ───────────────────────────
  @Post('teachers')
  @UseInterceptors(FileInterceptor('file'))
  uploadTeachers(
    @UploadedFile() file: UploadedExcel | undefined,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ jobId: string }> {
    return this.enqueueEntity('teachers', file, user, ip);
  }

  @Post('departments')
  @UseInterceptors(FileInterceptor('file'))
  uploadDepartments(
    @UploadedFile() file: UploadedExcel | undefined,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ jobId: string }> {
    return this.enqueueEntity('departments', file, user, ip);
  }

  @Post('courses')
  @UseInterceptors(FileInterceptor('file'))
  uploadCourses(
    @UploadedFile() file: UploadedExcel | undefined,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ jobId: string }> {
    return this.enqueueEntity('courses', file, user, ip);
  }

  private async enqueueEntity(
    entity: ImportEntity,
    file: UploadedExcel | undefined,
    user: AuthUser,
    ip: string,
  ): Promise<{ jobId: string }> {
    if (!file) throw new BadRequestException('No file uploaded (field name must be "file")');
    const name = file.originalname.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
      throw new BadRequestException('Only .xlsx or .csv files are accepted');
    }
    const jobId = await this.importService.enqueueEntityImport({
      entity,
      filePath: file.path,
      originalName: file.originalname,
      uploadedByUserId: user.id,
    });
    await this.audit.record({
      actorUserId: user.id,
      action: `import.${entity}.enqueue`,
      entity: 'Import',
      entityId: jobId,
      ip,
      after: { file: file.originalname, jobId },
    });
    return { jobId };
  }

  // ─────────────────────────── Status + errors (shared) ───────────────────────────
  @Get(':jobId')
  getState(@Param('jobId') jobId: string): Promise<ImportJobState> {
    return this.importService.getJobState(jobId);
  }

  @Get(':jobId/errors')
  downloadErrors(@Param('jobId') jobId: string, @Res() res: Response): void {
    const safeId = jobId.replace(/[^A-Za-z0-9_-]/g, '');
    const file = join(
      this.config.getOrThrow('STORAGE_DIR', { infer: true }),
      'imports',
      `${safeId}-errors.xlsx`,
    );
    if (!existsSync(file)) throw new NotFoundException('No error report for this job');
    res.download(file, 'import-errors.xlsx');
  }
}
