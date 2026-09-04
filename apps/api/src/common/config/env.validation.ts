import { z } from 'zod';

/** Parses "true/1/yes/on" (case-insensitive) as true; everything else false. */
const zBool = (def: boolean) =>
  z
    .preprocess((v) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
      return def;
    }, z.boolean())
    .default(def);

/**
 * The single source of truth for configuration. Validated at boot — the process refuses
 * to start with a missing/invalid variable rather than failing mysteriously at runtime.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  WEB_APP_URL: z.string().url().default('http://localhost:5173'),
  INSTITUTION_NAME: z.string().min(1).default('University of Rajshahi'),
  BRAND_PRIMARY: z.string().default('#1E3A5F'),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  SESSION_COOKIE_NAME: z.string().default('exam_sid'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(43_200),
  COOKIE_SECURE: zBool(false),
  COOKIE_DOMAIN: z.string().default(''),

  // Default per-user (or per-IP) ceiling for all authenticated routes: 300 requests / minute.
  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(300),
  // Disable rate limiting (only for single-source load testing — never in production).
  DISABLE_THROTTLE: zBool(false),
  // Login is per-IP; the default is 10 per 15 min. Raised only for single-source load tests
  // (300 k6 VUs share one IP) — the per-user autosave/report limits stay untouched.
  LOGIN_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),
  LOGIN_THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  // When false, the API stops running import/grading workers embedded — run `worker.ts` instead.
  RUN_EMBEDDED_WORKERS: zBool(true),

  // Require staff (admin / super_admin) to enrol in 2FA. Set false to let admins sign in with
  // just username + password (e.g. while onboarding several admins); turn back on for security.
  STAFF_2FA_REQUIRED: zBool(true),

  STORAGE_DIR: z.string().default('./storage'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SENTRY_DSN: z.string().default(''),

  // Maintenance mode: when true, all routes except /health return 503 (in-progress exam
  // attempts keep autosave/submit open). MAINTENANCE_RESUME is an optional ISO datetime shown
  // to users. NEVER enable while a live exam is running — see docs/README.md.
  MAINTENANCE_MODE: zBool(false),
  MAINTENANCE_RESUME: z.string().default(''),

  // App version surfaced by GET /health (set from package version / build in production).
  APP_VERSION: z.string().default('phase-6'),

  // Outgoing email (password reset, notifications). All optional — omit SMTP_HOST to log to console.
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: zBool(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('no-reply@exam.local'),
});

export type Env = z.infer<typeof envSchema>;

/** Passed to ConfigModule.forRoot({ validate }). Its return value becomes the loaded config. */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
