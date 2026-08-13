import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../types/auth';

/**
 * Global gate: every route requires an authenticated, active session unless marked @Public().
 * The server is authoritative — the SPA hiding UI is not a substitute for this check.
 */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const authenticated = typeof req.isAuthenticated === 'function' && req.isAuthenticated();
    if (!authenticated || !req.user) {
      throw new UnauthorizedException('Authentication required');
    }
    if ((req.user as AuthUser).status !== 'active') {
      throw new ForbiddenException('Account is suspended');
    }
    return true;
  }
}
