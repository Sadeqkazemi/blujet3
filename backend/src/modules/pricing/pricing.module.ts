import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarePricingProposal } from '../../database/entities/fare-pricing-proposal.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Flight } from '../../database/entities/flight.entity';
import { Booking } from '../../database/entities/booking.entity';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { AiModule } from '../ai/ai.module';
import { PanelsModule } from '../panels/panels.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { FlightsModule } from '../flights/flights.module';
import { BookingEngineModule } from '../booking-engine/booking-engine.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FarePricingProposal,
      FlightInstance,
      Flight,
      Booking,
    ]),
    AiModule,
    PanelsModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    FlightsModule,
    BookingEngineModule,
  ],
  controllers: [PricingController],
  providers: [PricingService],
})
export class PricingModule {}
