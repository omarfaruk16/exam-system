import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { RedisStore } from 'connect-redis';
import session from 'express-session';
import helmet from 'helmet';
import passport from 'passport';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './common/config/env.validation';
import { SESSION_KEY_PREFIX } from './common/redis/redis.constants';
import { RedisService } from './common/redis/redis.service';

// AuditLog.id is a BigInt; make it JSON-serializable everywhere.
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // Behind nginx in production: trust the first proxy for Secure cookies and req.ip.
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false }));

  // Redis-backed, revocable sessions.
  const redis = app.get(RedisService).client;
  const ttlSeconds = config.get('SESSION_TTL_SECONDS', { infer: true });
  const store = new RedisStore({ client: redis, prefix: SESSION_KEY_PREFIX, ttl: ttlSeconds });
  app.use(
    session({
      store,
      name: config.get('SESSION_COOKIE_NAME', { infer: true }),
      secret: config.get('SESSION_SECRET', { infer: true }),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: config.get('COOKIE_SECURE', { infer: true }),
        sameSite: 'lax',
        maxAge: ttlSeconds * 1000,
        domain: config.get('COOKIE_DOMAIN', { infer: true }) || undefined,
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Ensure runtime storage exists (import uploads, generated reports).
  mkdirSync(join(config.get('STORAGE_DIR', { infer: true }), 'imports'), { recursive: true });

  // Drain in-flight work on SIGTERM/SIGINT (Prisma disconnect, Redis quit).
  app.enableShutdownHooks();

  const port = config.get('API_PORT', { infer: true });
  const host = config.get('API_HOST', { infer: true });
  await app.listen(port, host);

  Logger.log(
    `API ready at http://${host}:${port}/api (v1)  [${isProd ? 'production' : 'development'}]`,
    'Bootstrap',
  );
}

void bootstrap();
