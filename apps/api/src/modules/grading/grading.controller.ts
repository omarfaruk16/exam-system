import { Body, Controller, Get, Ip, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import { GradeAnswerDto } from './dto/grade.dto';
import { WrittenGradingService } from './written-grading.service';

@Controller()
export class GradingController {
  constructor(private readonly written: WrittenGradingService) {}

  @Roles('teacher', 'admin', 'super_admin')
  @Get('exams/:examPublicId/answers/pending')
  pending(@CurrentUser() u: AuthUser, @Param('examPublicId') examPublicId: string) {
    return this.written.getPending(u, examPublicId);
  }

  @Roles('teacher', 'admin', 'super_admin')
  @Patch('answers/:answerPublicId/grade')
  grade(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('answerPublicId') answerPublicId: string,
    @Body() dto: GradeAnswerDto,
  ) {
    return this.written.gradeWritten(u, ip, answerPublicId, dto);
  }
}
