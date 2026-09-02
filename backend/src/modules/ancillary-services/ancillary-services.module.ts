import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AncillaryService } from '../../database/entities/ancillary-service.entity';
import { TravelExtraSetting } from '../../database/entities/travel-extra-setting.entity';
import { AuditModule } from '../audit/audit.module';
import { PanelsModule } from '../panels/panels.module';
import {
  AncillaryServicesController,
  PublicAncillaryServicesController,
} from './ancillary-services.controller';
import { AncillaryServicesService } from './ancillary-services.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AncillaryService, TravelExtraSetting]),
    AuditModule,
    PanelsModule,
  ],
  controllers: [AncillaryServicesController, PublicAncillaryServicesController],
  providers: [AncillaryServicesService],
  exports: [AncillaryServicesService],
})
export class AncillaryServicesModule {}
