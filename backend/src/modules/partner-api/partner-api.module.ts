import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgencyApiKey } from '../../database/entities/agency-api-key.entity';
import { RedisModule } from '../../redis/redis.module';
import { AgencyPortalModule } from '../agency-portal/agency-portal.module';
import { BookingEngineModule } from '../booking-engine/booking-engine.module';
import { PartnerApiController } from './partner-api.controller';
import { PartnerApiKeyGuard } from './partner-api-key.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgencyApiKey]),
    RedisModule,
    AgencyPortalModule,
    BookingEngineModule,
  ],
  controllers: [PartnerApiController],
  providers: [PartnerApiKeyGuard],
})
export class PartnerApiModule {}
