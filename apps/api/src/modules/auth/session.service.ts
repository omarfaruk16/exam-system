import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import {
  REDIS_CLIENT,
  SESSION_KEY_PREFIX,
  userSessionsKey,
} from '../../common/redis/redis.constants';

/**
 * Tracks which session ids belong to each user so we can:
 *  - enforce a single active session for students,
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

  /**
   * Whether the user currently holds any live session (its body still in Redis). Prunes
   * session ids whose bodies have already expired so a stale entry never reports a false
   * conflict. Used to warn a student that another device is signed in before evicting it.
   */
  async hasActiveSession(userId: number): Promise<boolean> {
    const key = userSessionsKey(userId);
    const sids = await this.redis.smembers(key);
    if (sids.length === 0) return false;

    const pipe = this.redis.pipeline();
    for (const sid of sids) pipe.exists(`${SESSION_KEY_PREFIX}${sid}`);
    const res = await pipe.exec();

    const dead: string[] = [];
    let live = false;
    res?.forEach((entry, i) => {
      const sid = sids[i];
      if (sid === undefined) return;
      if (entry[1] === 1) live = true;
      else dead.push(sid);
    });
    if (dead.length) await this.redis.srem(key, ...dead);
    return live;
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
