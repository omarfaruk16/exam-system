import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { join } from 'node:path';
import type { Env } from '../../common/config/env.validation';
import { QUEUE_EXAM_SCHEDULER, QUEUE_QUESTION_IMPORT } from '../../queue/queue.constants';
import { ExamAccessService } from './exam-access.service';
import { ExamController } from './exam.controller';
import { ExamSchedulerProcessor } from './exam-scheduler.processor';
import { ExamSchedulerService } from './exam-scheduler.service';
import { ExamService } from './exam.service';
import { QuestionController } from './question.controller';
import { QuestionImportProcessor } from './question-import.processor';
import { QuestionImportService } from './question-import.service';
import { QuestionService } from './question.service';

@Module({})
export class ExamModule {
  static register(): DynamicModule {
    const runEmbeddedWorker = process.env.RUN_EMBEDDED_WORKERS !== 'false';
    return {
      module: ExamModule,
      imports: [
        BullModule.registerQueue({ name: QUEUE_QUESTION_IMPORT }, { name: QUEUE_EXAM_SCHEDULER }),
        MulterModule.registerAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService<Env, true>) => ({
            dest: join(config.getOrThrow('STORAGE_DIR', { infer: true }), 'imports'),
            limits: { fileSize: 10 * 1024 * 1024 },
          }),
        }),
      ],
      controllers: [QuestionController, ExamController],
      providers: [
        ExamAccessService,
        QuestionService,
        ExamService,
        ExamSchedulerService,
        QuestionImportService,
        // Embedded workers by default; RUN_EMBEDDED_WORKERS=false moves them to worker.ts.
        ...(runEmbeddedWorker ? [ExamSchedulerProcessor, QuestionImportProcessor] : []),
      ],
    };
  }
}
