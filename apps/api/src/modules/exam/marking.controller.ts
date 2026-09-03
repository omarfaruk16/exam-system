import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import { MarkingService, METRIC_KEYS, type MetricKey } from './marking.service';

interface FinalizeBody {
  metric?: string;
}

@Controller('marking')
export class MarkingController {
  constructor(private readonly marking: MarkingService) {}

  // ── Teacher / admin: one course part's rollup + finalize ──
  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Get('parts/:partPublicId/summary')
  summary(@CurrentUser() u: AuthUser, @Param('partPublicId') partPublicId: string) {
    return this.marking.getCoursePartSummary(u, partPublicId);
  }

  @Roles('teacher', 'admin', 'super_admin', 'department_head')
  @Post('parts/:partPublicId/finalize')
  finalize(
    @CurrentUser() u: AuthUser,
    @Param('partPublicId') partPublicId: string,
    @Ip() ip: string,
    @Body() body: FinalizeBody,
  ) {
    if (!body?.metric || !METRIC_KEYS.includes(body.metric as MetricKey)) {
      throw new BadRequestException(
        'A "metric" (averageAll | bestOne | bestTwoAverage) is required to send the final report.',
      );
    }
    return this.marking.finalizePart(u, partPublicId, ip, body.metric as MetricKey);
  }

  // ── Admin: cascading filter options for the final-marking page ──
  @Roles('admin', 'super_admin', 'department_head')
  @Get('filters')
  filters(
    @CurrentUser() u: AuthUser,
    @Query('faculty') faculty?: string,
    @Query('department') department?: string,
    @Query('program') program?: string,
    @Query('batch') batch?: string,
    @Query('semester') semester?: string,
  ) {
    return this.marking.getFilterOptions(u, { faculty, department, program, batch, semester });
  }

  // ── Admin: the final-marking matrix (parts × students). Each cell shows the metric the
  //    teacher chose to send — the admin has no metric toggle. ──
  @Roles('admin', 'super_admin', 'department_head')
  @Get('matrix')
  matrix(
    @CurrentUser() u: AuthUser,
    @Query('faculty') faculty?: string,
    @Query('department') department?: string,
    @Query('program') program?: string,
    @Query('batch') batch?: string,
    @Query('semester') semester?: string,
    @Query('course') course?: string,
  ) {
    return this.marking.getFinalMarking(u, {
      faculty,
      department,
      program,
      batch,
      semester,
      course,
    });
  }

  // ── Admin: export the matrix as xlsx (item 3) ──
  @Roles('admin', 'super_admin', 'department_head')
  @Get('matrix/export')
  async exportMatrix(
    @Res() res: Response,
    @CurrentUser() u: AuthUser,
    @Query('faculty') faculty?: string,
    @Query('department') department?: string,
    @Query('program') program?: string,
    @Query('batch') batch?: string,
    @Query('semester') semester?: string,
    @Query('course') course?: string,
  ): Promise<void> {
    const { buffer, filename } = await this.marking.exportFinalMarking(u, {
      faculty,
      department,
      program,
      batch,
      semester,
      course,
    });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
