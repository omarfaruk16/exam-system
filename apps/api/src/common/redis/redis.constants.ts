/** DI token for the shared ioredis client (sessions, cache). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Key prefix used by connect-redis for session records. */
export const SESSION_KEY_PREFIX = 'exam:sess:';

/** Set of active session ids per user, used to enforce single-session for students. */
export const userSessionsKey = (userId: number): string => `exam:user-sessions:${userId}`;
