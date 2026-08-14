import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import { QUEUE_REPORT } from '../../queue/queue.constants';
import { ExamAccessService } from '../exam/exam-access.service';
import { ReportController } from './report.controller';
import { ReportDataService } from './report-data.service';
import { ReportProcessor } from './report.processor';
import { ReportService } from './report.service';

@Module({})
export class ReportModule {
  static register(): DynamicModule {
    const runEmbeddedWorker = process.env.RUN_EMBEDDED_WORKERS !== 'false';
    return {
      module: ReportModule,
      imports: [BullModule.registerQueue({ name: QUEUE_REPORT })],
      controllers: [ReportController],
      providers: [
        ReportService,
        ReportDataService,
        ExamAccessService,
        ...(runEmbeddedWorker ? [ReportProcessor] : []),
      ],
    };
  }
}
