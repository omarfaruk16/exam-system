import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';

const K = {
  deadline: (attemptId: number) => `exam:attempt:deadline:${attemptId}`,
  paper: (examId: number) => `exam:paper:${examId}`,
  session: (examId: number, studentId: number) => `exam:session:${examId}:${studentId}`,
  answers: (attemptId: number) => `exam:attempt:answers:${attemptId}`,
  idem: (key: string) => `exam:submit:idem:${key}`,
  lock: (attemptId: number) => `exam:submit:lock:${attemptId}`,
};

// Atomic compare-and-delete so we only release a lock we still own.
const RELEASE_LUA = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

@Injectable()
export class AttemptRedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // ── deadline (server-authoritative) ──
  async setDeadline(attemptId: number, deadlineMs: number, ttlSec: number): Promise<void> {
    await this.redis.set(K.deadline(attemptId), String(deadlineMs), 'EX', ttlSec);
  }
  async getDeadline(attemptId: number): Promise<number | null> {
    const v = await this.redis.get(K.deadline(attemptId));
    return v === null ? null : Number(v);
  }

  // ── paper cache (per exam) ──
  async getPaper(examId: number): Promise<string | null> {
    return this.redis.get(K.paper(examId));
  }
  async setPaper(examId: number, json: string, ttlSec: number): Promise<void> {
    await this.redis.set(K.paper(examId), json, 'EX', ttlSec);
  }

  // ── single active session per (exam, student) ──
  /** Returns the previous session id (if any) so the caller can audit a supersession. */
  async setSession(
    examId: number,
    studentId: number,
    sessionId: string,
    ttlSec: number,
  ): Promise<string | null> {
    const key = K.session(examId, studentId);
    const prev = await this.redis.get(key);
    await this.redis.set(key, sessionId, 'EX', ttlSec);
    return prev;
  }
  async getSession(examId: number, studentId: number): Promise<string | null> {
    return this.redis.get(K.session(examId, studentId));
  }

  // ── answer recovery snapshot (hash: questionPublicId -> json) ──
  async saveAnswerSnapshot(
    attemptId: number,
    entries: Record<string, string>,
    ttlSec: number,
  ): Promise<void> {
    if (Object.keys(entries).length === 0) return;
    const key = K.answers(attemptId);
    await this.redis.hset(key, entries);
    await this.redis.expire(key, ttlSec);
  }
  async readAnswerSnapshot(attemptId: number): Promise<Record<string, string>> {
    return this.redis.hgetall(K.answers(attemptId));
  }

  // ── idempotency cache ──
  async getIdempotent(key: string): Promise<string | null> {
    return this.redis.get(K.idem(key));
  }
  async setIdempotent(key: string, json: string, ttlSec: number): Promise<void> {
    await this.redis.set(K.idem(key), json, 'EX', ttlSec);
  }

  // ── distributed lock (SET NX PX + safe release) ──
  async acquireLock(attemptId: number, token: string, ttlMs: number): Promise<boolean> {
    const res = await this.redis.set(K.lock(attemptId), token, 'PX', ttlMs, 'NX');
    return res === 'OK';
  }
  async releaseLock(attemptId: number, token: string): Promise<void> {
    await this.redis.eval(RELEASE_LUA, 1, K.lock(attemptId), token);
  }
}
