import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { Env } from './common/config/env.validation';
import { validateEnv } from './common/config/env.validation';
import { AccessModule } from './common/access/access.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuthenticatedGuard } from './common/guards/authenticated.guard';
import { RolesGuard } from './common/guards/roles.guard';
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
          redact: {
            paths: ['req.headers.cookie', 'req.headers.authorization', 'req.body.password'],
            remove: true,
          },
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL_SECONDS', { infer: true }) * 1000,
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
        skipIf: () => config.get('DISABLE_THROTTLE', { infer: true }),
      }),
    }),
    PrismaModule,
    RedisModule,
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
    // Order matters: throttle first, then require auth, then check roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthenticatedGuard },
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
