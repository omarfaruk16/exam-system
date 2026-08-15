import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Maintenance gate. When MAINTENANCE_MODE is on, every route returns 503 EXCEPT:
 *   - /health (liveness/readiness for the load balancer), and
 *   - autosave/submit for an attempt that is still `in_progress` — a student mid-exam must never
 *     be cut off. Any other attempt state falls through to the 503.
 * Registered first so it short-circuits before auth/throttling.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.get('MAINTENANCE_MODE', { infer: true })) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const path = req.path;

    // Health is always reachable.
    if (/\/health(\/|$)/.test(path)) return true;

    // Keep in-progress exams alive: allow autosave + submit for a live attempt only.
    const m = path.match(/\/attempts\/([^/]+)\/(answers|submit)$/);
    if (m) {
      const attempt = await this.prisma.db.examAttempt.findFirst({
        where: { publicId: m[1] },
        select: { status: true },
      });
      if (attempt?.status === 'in_progress') return true;
    }

    throw new ServiceUnavailableException({
      message: 'The system is under maintenance. Please try again later.',
      estimatedResume: this.config.get('MAINTENANCE_RESUME', { infer: true }) || null,
    });
  }
}
