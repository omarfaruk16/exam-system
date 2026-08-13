import { Module } from '@nestjs/common';
import { OfferingController } from './offering.controller';
import { OfferingService } from './offering.service';
import { StructureController } from './structure.controller';
import { StructureService } from './structure.service';

@Module({
  controllers: [StructureController, OfferingController],
  providers: [StructureService, OfferingService],
})
export class OrgModule {}
