import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import { QUEUE_RESULTS } from '../../queue/queue.constants';
import { ExamAccessService } from '../exam/exam-access.service';
import { AttemptGradingService } from './attempt-grading.service';
import { GradingController } from './grading.controller';
import { ResultsProcessor } from './results.processor';
import { ResultsService } from './results.service';
import { WrittenGradingService } from './written-grading.service';

@Module({})
export class GradingModule {
  static register(): DynamicModule {
    const runEmbeddedWorker = process.env.RUN_EMBEDDED_WORKERS !== 'false';
    return {
      module: GradingModule,
      global: true, // AttemptGradingService is shared with the attempt module's MCQ grader
      imports: [BullModule.registerQueue({ name: QUEUE_RESULTS })],
      controllers: [GradingController],
      providers: [
        AttemptGradingService,
        ResultsService,
        WrittenGradingService,
        ExamAccessService,
        ...(runEmbeddedWorker ? [ResultsProcessor] : []),
      ],
      exports: [AttemptGradingService],
    };
  }
}
