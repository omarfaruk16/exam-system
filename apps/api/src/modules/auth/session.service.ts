import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import {
  REDIS_CLIENT,
  SESSION_KEY_PREFIX,
  userSessionsKey,
} from '../../common/redis/redis.constants';

/**
 * Tracks which session ids belong to each user so we can:
 *  - enforce a single active session for students (§5),
 *  - revoke sessions on suspension / password change / forced logout.
 * Session bodies themselves live in Redis under `${SESSION_KEY_PREFIX}${sid}` (connect-redis).
 */
@Injectable()
export class SessionService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async registerSession(userId: number, sid: string, ttlSeconds: number): Promise<void> {
    const key = userSessionsKey(userId);
    await this.redis.sadd(key, sid);
    await this.redis.expire(key, ttlSeconds);
  }

  async removeSession(userId: number, sid: string): Promise<void> {
    await this.redis.srem(userSessionsKey(userId), sid);
  }

  /** Destroy every other session for this user, keeping only `keepSid` (student single-session). */
  async enforceSingleSession(userId: number, keepSid: string): Promise<void> {
    const key = userSessionsKey(userId);
    const sids = await this.redis.smembers(key);
    const toKill = sids.filter((s) => s !== keepSid);
    if (toKill.length === 0) return;

    const pipe = this.redis.pipeline();
    for (const sid of toKill) pipe.del(`${SESSION_KEY_PREFIX}${sid}`);
    pipe.srem(key, ...toKill);
    await pipe.exec();
  }

  /** Revoke all of a user's sessions (used on suspend / password change). */
  async revokeAll(userId: number): Promise<void> {
    const key = userSessionsKey(userId);
    const sids = await this.redis.smembers(key);
    const pipe = this.redis.pipeline();
    for (const sid of sids) pipe.del(`${SESSION_KEY_PREFIX}${sid}`);
    pipe.del(key);
    await pipe.exec();
  }
}
