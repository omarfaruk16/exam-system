import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import { QUEUE_ATTEMPT_SWEEP, QUEUE_GRADING } from '../../queue/queue.constants';
import { AttemptFinalizeService } from './attempt-finalize.service';
import { AttemptRedisService } from './attempt.redis';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { AttemptSweepProcessor } from './attempt-sweep.processor';
import { GradingProcessor } from './grading.processor';
import { GradingService } from './grading.service';
import { PaperService } from './paper.service';

@Module({})
export class AttemptModule {
  static register(): DynamicModule {
    const runEmbeddedWorker = process.env.RUN_EMBEDDED_WORKERS !== 'false';
    return {
      module: AttemptModule,
      imports: [BullModule.registerQueue({ name: QUEUE_GRADING }, { name: QUEUE_ATTEMPT_SWEEP })],
      controllers: [AttemptController],
      providers: [
        AttemptRedisService,
        PaperService,
        AttemptService,
        AttemptFinalizeService,
        GradingService,
        ...(runEmbeddedWorker ? [GradingProcessor, AttemptSweepProcessor] : []),
      ],
    };
  }
}
