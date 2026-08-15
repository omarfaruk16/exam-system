import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthUser } from '../types/auth';

/**
 * Rate-limit key: per authenticated user where we know them (so limits follow the account across
 * IPs/proxies), otherwise per IP (login and other public routes). This makes the "per user" limits
 * in the spec (autosave, reports, the 300/min ceiling) actually per user, not per shared NAT IP.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    const user = req.user as AuthUser | undefined;
    const tracker = user ? `user:${user.id}` : (req.ip ?? 'unknown');
    return Promise.resolve(tracker);
  }
}
