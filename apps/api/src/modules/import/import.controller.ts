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
import type { UploadedExcel } from './import.types';

@Controller('imports/students')
@Roles('admin', 'super_admin')
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Upload an Excel roster for a batch. Returns immediately with a job id; work happens in a worker. */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: UploadedExcel | undefined,
    @Query('batch') batchPublicId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ jobId: string }> {
    if (!file) throw new BadRequestException('No file uploaded (field name must be "file")');
    if (!batchPublicId) throw new BadRequestException('A "batch" query parameter is required');

    const batch = await this.prisma.db.batch.findFirst({
      where: { publicId: batchPublicId },
    });
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

  @Get(':jobId')
  getState(@Param('jobId') jobId: string): Promise<ImportJobState> {
    return this.importService.getJobState(jobId);
  }

  /** Download the error report (rejected rows) for a completed import, if any. */
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
