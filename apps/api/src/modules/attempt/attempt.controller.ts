import { Body, Controller, Get, Headers, HttpCode, Ip, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import { AttemptFinalizeService } from './attempt-finalize.service';
import { AttemptService } from './attempt.service';
import { AutosaveDto } from './dto/attempt.dto';

@Controller()
export class AttemptController {
  constructor(
    private readonly attempts: AttemptService,
    private readonly finalize: AttemptFinalizeService,
  ) {}

  /** Server clock — the SPA computes its offset from this to render an accurate countdown. */
  @Get('time')
  serverTime(): { serverTime: string } {
    return { serverTime: new Date().toISOString() };
  }

  @Roles('student')
  @Get('me/exams')
  myExams(@CurrentUser() u: AuthUser) {
    return this.attempts.listMyExams(u);
  }

  @Roles('student')
  @Post('exams/:examPublicId/start')
  @HttpCode(200)
  start(@CurrentUser() u: AuthUser, @Ip() ip: string, @Param('examPublicId') examPublicId: string) {
    return this.attempts.start(u, examPublicId, ip);
  }

  @Roles('student')
  @Post('attempts/:attemptPublicId/answers')
  @HttpCode(200)
  autosave(
    @CurrentUser() u: AuthUser,
    @Param('attemptPublicId') id: string,
    @Headers('x-exam-session') sessionId: string | undefined,
    @Body() dto: AutosaveDto,
  ) {
    return this.attempts.autosave(u, id, sessionId ?? '', dto.answers);
  }

  @Roles('student')
  @Post('attempts/:attemptPublicId/submit')
  @HttpCode(200)
  submit(
    @CurrentUser() u: AuthUser,
    @Ip() ip: string,
    @Param('attemptPublicId') id: string,
    @Headers('x-exam-session') sessionId: string | undefined,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.finalize.finalize(id, {
      auto: false,
      sessionId: sessionId ?? '',
      idempotencyKey,
      actorUserId: u.id,
      ip,
    });
  }

  @Roles('student', 'teacher', 'admin', 'super_admin')
  @Get('attempts/:attemptPublicId/result')
  result(@CurrentUser() u: AuthUser, @Param('attemptPublicId') id: string) {
    return this.attempts.getResult(u, id);
  }
}
