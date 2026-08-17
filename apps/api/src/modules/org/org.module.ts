import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StructureController } from './structure.controller';
import { StructureService } from './structure.service';

@Module({
  imports: [AuthModule],
  controllers: [StructureController],
  providers: [StructureService],
  exports: [StructureService],
})
export class OrgModule {}
