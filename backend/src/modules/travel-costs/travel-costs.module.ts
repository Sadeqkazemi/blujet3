import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TravelExtraSetting } from '../../database/entities/travel-extra-setting.entity';
import { AuditModule } from '../audit/audit.module';
import { AncillaryServicesModule } from '../ancillary-services/ancillary-services.module';
import {
  PublicTravelCostsController,
  TravelCostsController,
} from './travel-costs.controller';
import { TravelCostsService } from './travel-costs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TravelExtraSetting]),
    AuditModule,
    AncillaryServicesModule,
  ],
  controllers: [TravelCostsController, PublicTravelCostsController],
  providers: [TravelCostsService],
  exports: [TravelCostsService],
})
export class TravelCostsModule {}
