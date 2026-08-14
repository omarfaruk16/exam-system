import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import { RequestReportDto } from './dto/report.dto';
import { ReportService } from './report.service';

@Controller('reports')
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Roles('teacher', 'admin', 'super_admin')
  @Post()
  @HttpCode(200)
  request(@CurrentUser() u: AuthUser, @Body() dto: RequestReportDto) {
    return this.reports.request(u, dto);
  }

  @Roles('teacher', 'admin', 'super_admin')
  @Get(':jobId')
  status(@Param('jobId') jobId: string) {
    return this.reports.status(jobId);
  }

  @Roles('teacher', 'admin', 'super_admin')
  @Get(':jobId/download')
  download(
    @Param('jobId') jobId: string,
    @Query('format') format: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ): void {
    const path = this.reports.resolveDownload(jobId, format, exp, sig);
    res.download(path, `report-${jobId}.${format}`);
  }
}
