import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/config/env.validation';
import { AccessModule } from './common/access/access.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AttemptFinalizeService } from './modules/attempt/attempt-finalize.service';
import { AttemptRedisService } from './modules/attempt/attempt.redis';
import { AttemptSweepProcessor } from './modules/attempt/attempt-sweep.processor';
import { GradingProcessor } from './modules/attempt/grading.processor';
import { GradingService } from './modules/attempt/grading.service';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ExamAccessService } from './modules/exam/exam-access.service';
import { ExamSchedulerProcessor } from './modules/exam/exam-scheduler.processor';
import { ExamSchedulerService } from './modules/exam/exam-scheduler.service';
import { QuestionImportProcessor } from './modules/exam/question-import.processor';
import { AttemptGradingService } from './modules/grading/attempt-grading.service';
import { ResultsProcessor } from './modules/grading/results.processor';
import { ResultsService } from './modules/grading/results.service';
import { ReportProcessor } from './modules/report/report.processor';
import { EntityImportProcessor } from './modules/import/entity-import.processor';
import { StudentImportProcessor } from './modules/import/student-import.processor';
import {
  QUEUE_ATTEMPT_SWEEP,
  QUEUE_ENTITY_IMPORT,
  QUEUE_EXAM_SCHEDULER,
  QUEUE_GRADING,
  QUEUE_QUESTION_IMPORT,
  QUEUE_REPORT,
  QUEUE_RESULTS,
  QUEUE_STUDENT_IMPORT,
} from './queue/queue.constants';
import { QueueModule } from './queue/queue.module';

/**
 * Standalone worker root — the same processors the API can run embedded, but with no HTTP layer.
 * Booted by `src/worker.ts`. Set RUN_EMBEDDED_WORKERS=false on the API and run this to split workers
 * into their own process/container without a code change.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    PrismaModule,
    RedisModule,
    AccessModule,
    QueueModule,
    AuditModule,
    AuthModule,
    BullModule.registerQueue(
      { name: QUEUE_STUDENT_IMPORT },
      { name: QUEUE_ENTITY_IMPORT },
      { name: QUEUE_QUESTION_IMPORT },
      { name: QUEUE_EXAM_SCHEDULER },
      { name: QUEUE_GRADING },
      { name: QUEUE_ATTEMPT_SWEEP },
      { name: QUEUE_RESULTS },
      { name: QUEUE_REPORT },
    ),
  ],
  providers: [
    StudentImportProcessor,
    EntityImportProcessor,
    QuestionImportProcessor,
    ExamSchedulerService,
    ExamSchedulerProcessor,
    ExamAccessService,
    AttemptRedisService,
    AttemptFinalizeService,
    AttemptGradingService,
    GradingService,
    GradingProcessor,
    AttemptSweepProcessor,
    ResultsService,
    ResultsProcessor,
    ReportProcessor,
  ],
})
export class WorkerModule {}
