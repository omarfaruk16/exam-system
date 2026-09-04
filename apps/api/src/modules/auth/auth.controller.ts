import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Ip,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { LoginResult, SessionUser, TwoFactorSetup } from '@exam/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import type { Env } from '../../common/config/env.validation';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { TwoFactorConfirmDto, TwoFactorLoginDto } from './dto/two-factor.dto';
import { SessionService } from './session.service';
import { TwoFactorService } from './two-factor.service';

const GENERIC_2FA_ERROR = 'Invalid or expired code';

// Read at import time from the environment so the login limit can be tuned per deployment
// (and raised for single-source load tests) without touching the per-user autosave/report limits.
const LOGIN_LIMIT = Number(process.env.LOGIN_THROTTLE_LIMIT ?? 10);
const LOGIN_TTL_MS = Number(process.env.LOGIN_THROTTLE_TTL_SECONDS ?? 900) * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly twoFactor: TwoFactorService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ─────────────────────────────── Login ───────────────────────────────
  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: LOGIN_TTL_MS } }) // per-IP; env-tunable
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Ip() ip: string): Promise<LoginResult> {
    const user = await this.auth.validateUser(dto.identifier, dto.password);

    // Enrolled 2FA users must clear the second factor before a session is issued — unless 2FA
    // is switched off globally (STAFF_2FA_REQUIRED=false), in which case sign-in is direct.
    if (user.twoFactorEnabled && this.twoFactor.enforced()) {
      const partialToken = await this.twoFactor.mintPartialToken(user.id);
      return { status: 'two_factor_required', partialToken };
    }

    await this.completeLogin(req, user, ip);
    return { status: 'ok', user: await this.auth.toSessionUser(user) };
  }

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: LOGIN_TTL_MS } }) // per-IP; env-tunable
  @Post('2fa/login')
  @HttpCode(200)
  async twoFactorLogin(
    @Body() dto: TwoFactorLoginDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<LoginResult> {
    const userId = await this.twoFactor.consumePartialToken(dto.partialToken);
    if (userId === null)
      throw new UnauthorizedException('Your sign-in session expired. Start over.');

    // Same generic error for a wrong code AND a locked step — never reveal which.
    if (await this.twoFactor.isLocked(userId)) throw new UnauthorizedException(GENERIC_2FA_ERROR);

    const encrypted = await this.auth.getTwoFactorSecret(userId);
    const valid = encrypted && this.twoFactor.verify(dto.code, this.twoFactor.decrypt(encrypted));
    if (!valid) {
      const nowLocked = await this.twoFactor.recordFailure(userId);
      if (nowLocked) {
        await this.audit.record({
          actorUserId: userId,
          action: 'auth.2fa_locked',
          entity: 'User',
          entityId: userId,
          ip,
        });
      }
      throw new UnauthorizedException(GENERIC_2FA_ERROR);
    }

    await this.twoFactor.clearFailures(userId);
    await this.twoFactor.invalidatePartialToken(dto.partialToken);
    const user = await this.auth.buildAuthUser(userId);
    if (!user) throw new UnauthorizedException(GENERIC_2FA_ERROR);

    await this.completeLogin(req, user, ip);
    return { status: 'ok', user: await this.auth.toSessionUser(user) };
  }

  // ─────────────────────────── Password reset ───────────────────────────
  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ status: 'ok' }> {
    await this.auth.forgotPassword(dto.email);
    return { status: 'ok' }; // always 200 — never reveal whether an email exists
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ status: 'ok' }> {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return { status: 'ok' };
  }

  // ─────────────────────────── 2FA enrolment ───────────────────────────
  @Post('2fa/setup')
  @HttpCode(200)
  async setupTwoFactor(@CurrentUser() user: AuthUser): Promise<TwoFactorSetup> {
    const secret = this.twoFactor.generateSecret();
    await this.twoFactor.storePendingSecret(user.id, secret);
    const { otpauth, qr } = await this.twoFactor.buildSetup(user, secret);
    return { otpauth, qr, secret };
  }

  @Post('2fa/confirm')
  @HttpCode(200)
  async confirmTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body() dto: TwoFactorConfirmDto,
    @Ip() ip: string,
  ): Promise<{ status: 'ok'; user: SessionUser }> {
    const secret = await this.twoFactor.getPendingSecret(user.id);
    if (!secret) throw new BadRequestException('Your setup session expired. Start setup again.');
    if (!this.twoFactor.verify(dto.code, secret)) {
      throw new BadRequestException('That code is not valid. Check your authenticator and retry.');
    }
    await this.auth.enableTwoFactor(user.id, this.twoFactor.encrypt(secret));
    await this.twoFactor.clearPendingSecret(user.id);
    await this.audit.record({
      actorUserId: user.id,
      action: 'auth.2fa_enrolled',
      entity: 'User',
      entityId: user.id,
      ip,
    });
    const fresh = await this.auth.buildAuthUser(user.id);
    return { status: 'ok', user: await this.auth.toSessionUser(fresh ?? user) };
  }

  // ─────────────────────────── 2FA reset (admin) ───────────────────────────
  @Roles('admin', 'super_admin')
  @Post('2fa/reset/:userPublicId')
  @HttpCode(200)
  async resetTwoFactor(
    @CurrentUser() actor: AuthUser,
    @Param('userPublicId') userPublicId: string,
    @Ip() ip: string,
  ): Promise<{ status: 'ok' }> {
    const target = await this.auth.findByPublicId(userPublicId);
    if (!target) throw new NotFoundException('User not found');

    const actorIsSuper = actor.roles.some((r) => r.role === 'super_admin');
    const targetIsAdmin = target.roles.some((r) => r.role === 'admin' || r.role === 'super_admin');
    // A plain admin may reset staff below admin; only a super admin may reset another admin.
    if (!actorIsSuper && targetIsAdmin) {
      throw new ForbiddenException('Only a super admin can reset an administrator’s 2FA');
    }

    await this.auth.disableTwoFactor(target.id);
    await this.twoFactor.clearFailures(target.id);
    await this.sessions.revokeAll(target.id); // force re-auth + re-enrolment
    await this.audit.record({
      actorUserId: actor.id,
      action: 'auth.2fa_reset',
      entity: 'User',
      entityId: target.id,
      after: { targetPublicId: userPublicId },
      ip,
    });
    return { status: 'ok' };
  }

  // ─────────────────────────────── Session ───────────────────────────────
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

  /** Establish the persistent session and write the login audit trail. */
  private async completeLogin(req: Request, user: AuthUser, ip: string): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      req.login(user, (err) => (err ? reject(err) : resolve())),
    );
    const ttl = this.config.get('SESSION_TTL_SECONDS', { infer: true });
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
  }
}
