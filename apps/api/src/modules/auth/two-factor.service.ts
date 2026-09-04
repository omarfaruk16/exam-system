import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Env } from '../../common/config/env.validation';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import type { AuthUser } from '../../common/types/auth';
import type { RoleName } from '@exam/types';

/** Staff roles must use 2FA; students never do. */
const ROLES_REQUIRING_2FA: ReadonlySet<RoleName> = new Set(['super_admin', 'admin']);

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60;
const SETUP_TTL_SECONDS = 10 * 60;

@Injectable()
export class TwoFactorService {
  private readonly key: Buffer;
  private readonly issuer: string;
  private readonly staff2faRequired: boolean;

  constructor(
    config: ConfigService<Env, true>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    // Derive a stable 32-byte key from the session secret — no extra env var to manage.
    this.key = scryptSync(config.getOrThrow('SESSION_SECRET', { infer: true }), 'exam-2fa-v1', 32);
    this.issuer = config.get('INSTITUTION_NAME', { infer: true });
    this.staff2faRequired = config.get('STAFF_2FA_REQUIRED', { infer: true });
    authenticator.options = { window: 1 }; // tolerate ±1 time-step clock skew
  }

  /** Whether 2FA is switched on at all (STAFF_2FA_REQUIRED). When false, 2FA is fully disabled. */
  enforced(): boolean {
    return this.staff2faRequired;
  }

  requiresTwoFactor(user: AuthUser): boolean {
    if (!this.staff2faRequired) return false;
    return user.roles.some((r) => ROLES_REQUIRING_2FA.has(r.role));
  }

  /** A staff user who must enrol before they can use the app. */
  needsSetup(user: AuthUser): boolean {
    return this.requiresTwoFactor(user) && !user.twoFactorEnabled;
  }

  // ── enrolment ──
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  async buildSetup(user: AuthUser, secret: string): Promise<{ otpauth: string; qr: string }> {
    const otpauth = authenticator.keyuri(user.username, this.issuer, secret);
    const qr = await QRCode.toDataURL(otpauth);
    return { otpauth, qr };
  }

  /** Stash the pending (unconfirmed) secret in Redis until the user proves they can generate codes. */
  async storePendingSecret(userId: number, secret: string): Promise<void> {
    await this.redis.set(this.pendingKey(userId), secret, 'EX', SETUP_TTL_SECONDS);
  }
  getPendingSecret(userId: number): Promise<string | null> {
    return this.redis.get(this.pendingKey(userId));
  }
  async clearPendingSecret(userId: number): Promise<void> {
    await this.redis.del(this.pendingKey(userId));
  }

  verify(token: string, secret: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch {
      return false;
    }
  }

  // ── login-step lockout (Redis) ──
  async isLocked(userId: number): Promise<boolean> {
    return (await this.redis.get(this.lockKey(userId))) !== null;
  }

  /** Count a failed code; lock the step for 15 min once the limit is hit. Returns whether now locked. */
  async recordFailure(userId: number): Promise<boolean> {
    const key = this.attemptsKey(userId);
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, LOCKOUT_SECONDS);
    if (count >= MAX_ATTEMPTS) {
      await this.redis.set(this.lockKey(userId), '1', 'EX', LOCKOUT_SECONDS);
      return true;
    }
    return false;
  }

  async clearFailures(userId: number): Promise<void> {
    await this.redis.del(this.attemptsKey(userId), this.lockKey(userId));
  }

  // ── partial (pre-2FA) login token ──
  async mintPartialToken(userId: number): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.redis.set(this.partialKey(token), String(userId), 'EX', 5 * 60);
    return token;
  }

  async consumePartialToken(token: string): Promise<number | null> {
    const key = this.partialKey(token);
    const val = await this.redis.get(key);
    return val ? Number(val) : null;
  }
  async invalidatePartialToken(token: string): Promise<void> {
    await this.redis.del(this.partialKey(token));
  }

  // ── at-rest encryption for the confirmed secret (AES-256-GCM) ──
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }

  decrypt(stored: string): string {
    const [ivHex, tagHex, dataHex] = stored.split(':');
    if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed 2FA secret');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString(
      'utf8',
    );
  }

  /** Constant-time compare (used where we compare tokens directly). */
  safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }

  private pendingKey = (id: number) => `2fa:pending:${id}`;
  private attemptsKey = (id: number) => `2fa:attempts:${id}`;
  private lockKey = (id: number) => `2fa:lock:${id}`;
  private partialKey = (token: string) => `2fa:partial:${token}`;
}
