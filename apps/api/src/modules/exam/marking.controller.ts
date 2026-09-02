import { Controller, Get, Ip, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import { MarkingService } from './marking.service';

type Metric = 'averageAll' | 'bestOne' | 'bestTwoAverage';
const METRICS: Metric[] = ['averageAll', 'bestOne', 'bestTwoAverage'];

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
  ) {
    return this.marking.finalizePart(u, partPublicId, ip);
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

  // ── Admin: the final-marking matrix (parts × students) ──
  @Roles('admin', 'super_admin', 'department_head')
  @Get('matrix')
  matrix(
    @CurrentUser() u: AuthUser,
    @Query('metric') metric?: string,
    @Query('faculty') faculty?: string,
    @Query('department') department?: string,
    @Query('program') program?: string,
    @Query('batch') batch?: string,
    @Query('semester') semester?: string,
    @Query('course') course?: string,
  ) {
    const m: Metric = METRICS.includes(metric as Metric) ? (metric as Metric) : 'bestTwoAverage';
    return this.marking.getFinalMarking(
      u,
      { faculty, department, program, batch, semester, course },
      m,
    );
  }
}
