import { Body, Controller, Get, HttpCode, Ip, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { LoginResult, SessionUser } from '@exam/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../../common/types/auth';
import type { Env } from '../../common/config/env.validation';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  // Stricter per-IP limit on the login endpoint (progressive lockout is hardened in phase 6).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() _dto: LoginDto,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<LoginResult> {
    const ttl = this.config.get('SESSION_TTL_SECONDS', { infer: true });

    // Students get a single active session; a new login kills the old one.
    if (user.roles.some((r) => r.role === 'student')) {
      await this.sessions.enforceSingleSession(user.id, req.sessionID);
    }
    await this.sessions.registerSession(user.id, req.sessionID, ttl);
    await this.auth.recordLogin(user.id);
    await this.audit.record({
      actorUserId: user.id,
      action: 'auth.login',
      entity: 'User',
      entityId: user.id,
      ip,
      userAgent: req.headers['user-agent'] ?? null,
    });

    return { status: 'ok', user: await this.auth.toSessionUser(user) };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<SessionUser> {
    return this.auth.toSessionUser(user);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: 'ok' }> {
    const user = req.user as AuthUser | undefined;
    const sid = req.sessionID;
    if (user) await this.sessions.removeSession(user.id, sid);

    await new Promise<void>((resolve, reject) =>
      req.logout((err) => (err ? reject(err) : resolve())),
    );
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    res.clearCookie(this.config.get('SESSION_COOKIE_NAME', { infer: true }));
    return { status: 'ok' };
  }
}
