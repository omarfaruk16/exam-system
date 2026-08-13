import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { join } from 'node:path';
import type { Env } from '../../common/config/env.validation';
import { QUEUE_STUDENT_IMPORT } from '../../queue/queue.constants';
import { AuthModule } from '../auth/auth.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { StudentImportProcessor } from './student-import.processor';

@Module({
  imports: [
    AuthModule, // provides PasswordService for the import worker
    BullModule.registerQueue({ name: QUEUE_STUDENT_IMPORT }),
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        dest: join(config.getOrThrow('STORAGE_DIR', { infer: true }), 'imports'),
        limits: { fileSize: 10 * 1024 * 1024 },
      }),
    }),
  ],
  controllers: [ImportController],
  // StudentImportProcessor runs embedded in the API process for now (single `pnpm dev`).
  // A dedicated worker process is introduced when it matters for load (phase 4).
  providers: [ImportService, StudentImportProcessor],
})
export class ImportModule {}
