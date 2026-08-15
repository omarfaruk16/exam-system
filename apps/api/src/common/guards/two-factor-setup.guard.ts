import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { TwoFactorService } from '../../modules/auth/two-factor.service';
import type { AuthUser } from '../types/auth';

/**
 * Defence-in-depth for enrolment: a staff user who must set up 2FA can reach ONLY the auth routes
 * (to enrol or log out) until they do. The SPA enforces the same gate for UX; this is the authority.
 */
@Injectable()
export class TwoFactorSetupGuard implements CanActivate {
  constructor(private readonly twoFactor: TwoFactorService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as AuthUser | undefined;
    if (!user) return true; // unauthenticated routes are handled by the auth guard

    if (this.twoFactor.needsSetup(user)) {
      // Allow only the auth surface (2FA setup/confirm, me, logout).
      const path = req.path;
      const isAuthRoute = /\/auth(\/|$)/.test(path);
      if (!isAuthRoute) {
        throw new ForbiddenException('TWO_FACTOR_SETUP_REQUIRED');
      }
    }
    return true;
  }
}
