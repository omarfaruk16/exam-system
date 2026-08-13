import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis, { type Redis } from 'ioredis';
import type { Env } from '../config/env.validation';

/**
 * Owns the shared ioredis connection used for sessions and cache-aside.
 * BullMQ creates its own connections (see QueueModule) because it requires
 * `maxRetriesPerRequest: null`, which we do not want for request-path commands.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: ConfigService<Env, true>) {
    const url = config.getOrThrow('REDIS_URL', { infer: true });
    this.client = new IORedis(url, {
      lazyConnect: false,
      enableAutoPipelining: true,
    });
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
    this.client.on('connect', () => this.logger.log('Redis connected'));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
