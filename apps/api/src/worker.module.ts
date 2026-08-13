import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { StudentImportProcessor } from './modules/import/student-import.processor';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { QUEUE_STUDENT_IMPORT } from './queue/queue.constants';
import { QueueModule } from './queue/queue.module';

/**
 * Standalone worker root — the same processors the API can run embedded, but with no HTTP layer.
 * Booted by `src/worker.ts`. This is the "separate entrypoint" that lets workers scale out to their
 * own process/container without a refactor: set RUN_EMBEDDED_WORKERS=false on the API and run this.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    PrismaModule,
    RedisModule,
    QueueModule,
    AuditModule,
    AuthModule,
    BullModule.registerQueue({ name: QUEUE_STUDENT_IMPORT }),
  ],
  providers: [StudentImportProcessor],
})
export class WorkerModule {}
