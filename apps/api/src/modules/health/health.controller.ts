import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import type { Env } from '../../common/config/env.validation';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is up. Always 200 — reachable even during maintenance mode. */
  @Public()
  @Get()
  root(): { status: 'ok'; uptime: number; version: string } {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      version: this.config.get('APP_VERSION', { infer: true }),
    };
  }

  /** Alias kept for existing Docker/nginx probes. */
  @Public()
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: Postgres and Redis are reachable. 503 if either is down (LB / Docker healthcheck). */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<{
    status: 'ok' | 'degraded';
    postgres: 'ok' | 'error';
    redis: 'ok' | 'error';
  }> {
    let postgres: 'ok' | 'error' = 'error';
    let redis: 'ok' | 'error' = 'error';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      postgres = 'ok';
    } catch {
      postgres = 'error';
    }
    try {
      redis = (await this.redis.ping()) === 'PONG' ? 'ok' : 'error';
    } catch {
      redis = 'error';
    }

    const ok = postgres === 'ok' && redis === 'ok';
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'degraded', postgres, redis };
  }
}
