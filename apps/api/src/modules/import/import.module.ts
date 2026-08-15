import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { join } from 'node:path';
import type { Env } from '../../common/config/env.validation';
import { QUEUE_ENTITY_IMPORT, QUEUE_STUDENT_IMPORT } from '../../queue/queue.constants';
import { AuthModule } from '../auth/auth.module';
import { EntityImportProcessor } from './entity-import.processor';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { StudentImportProcessor } from './student-import.processor';

@Module({})
export class ImportModule {
  /**
   * The API always exposes the upload/status controller (a producer). It also runs the worker
   * embedded UNLESS `RUN_EMBEDDED_WORKERS=false`, in which case a separate `worker.ts` process
   * consumes the queue instead — no code change required to split them.
   */
  static register(): DynamicModule {
    const runEmbeddedWorker = process.env.RUN_EMBEDDED_WORKERS !== 'false';
    return {
      module: ImportModule,
      imports: [
        AuthModule, // provides PasswordService for the import worker
        BullModule.registerQueue({ name: QUEUE_STUDENT_IMPORT }),
        BullModule.registerQueue({ name: QUEUE_ENTITY_IMPORT }),
        MulterModule.registerAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService<Env, true>) => ({
            dest: join(config.getOrThrow('STORAGE_DIR', { infer: true }), 'imports'),
            limits: { fileSize: 10 * 1024 * 1024 },
          }),
        }),
      ],
      controllers: [ImportController],
      providers: [
        ImportService,
        ...(runEmbeddedWorker ? [StudentImportProcessor, EntityImportProcessor] : []),
      ],
    };
  }
}
