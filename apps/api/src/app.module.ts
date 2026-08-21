import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { REDIS_CLIENT } from './common/redis/redis.constants';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { MaintenanceGuard } from './common/guards/maintenance.guard';
import type { Env } from './common/config/env.validation';
import { validateEnv } from './common/config/env.validation';
import { AccessModule } from './common/access/access.module';
import { MailModule } from './common/mail/mail.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuthenticatedGuard } from './common/guards/authenticated.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TwoFactorSetupGuard } from './common/guards/two-factor-setup.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { AttemptModule } from './modules/attempt/attempt.module';
import { ExamModule } from './modules/exam/exam.module';
import { GradingModule } from './modules/grading/grading.module';
import { ImportModule } from './modules/import/import.module';
import { OrgModule } from './modules/org/org.module';
import { ReportModule } from './modules/report/report.module';
import { UsersModule } from './modules/users/users.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
              : undefined,
          // Attach the authenticated user + client IP to every request log line.
          customProps: (req) => ({
            userId: (req as { user?: { id?: number } }).user?.id ?? null,
            ip: (req as { ip?: string }).ip ?? null,
          }),
          // Never log secrets: cookies, auth headers, passwords, or 2FA material.
          redact: {
            paths: [
              'req.headers.cookie',
              'req.headers.authorization',
              'req.body.password',
              'req.body.currentPassword',
              'req.body.newPassword',
              'req.body.code',
              'req.body.totp',
              'req.body.partialToken',
            ],
            remove: true,
          },
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService<Env, true>, redis: Redis) => ({
        // The default named throttler is the hard per-user (or per-IP) ceiling; specific routes
        // (login, autosave, reports) tighten it with their own @Throttle overrides.
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL_SECONDS', { infer: true }) * 1000,
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
        // Redis store so limits are shared across API instances behind the load balancer.
        storage: new ThrottlerStorageRedisService(redis),
        skipIf: () => config.get('DISABLE_THROTTLE', { infer: true }),
      }),
    }),
    PrismaModule,
    RedisModule,
    MailModule,
    AccessModule,
    AuditModule,
    QueueModule,
    AuthModule,
    UsersModule,
    OrgModule,
    GradingModule.register(),
    ExamModule.register(),
    AttemptModule.register(),
    ReportModule.register(),
    ImportModule.register(),
    HealthModule,
  ],
  providers: [
    // Order matters: maintenance gate, then throttle, then auth, then 2FA enrolment, then roles.
    { provide: APP_GUARD, useClass: MaintenanceGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthenticatedGuard },
    { provide: APP_GUARD, useClass: TwoFactorSetupGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
