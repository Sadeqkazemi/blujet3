import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Airport } from '../../database/entities/airport.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { BookingEngineModule } from '../booking-engine/booking-engine.module';
import { CoreItineraryController } from './core-itinerary.controller';
import { CoreItineraryService } from './core-itinerary.service';
import { HttpPssClient } from './http-pss.client';
import { PssInternalAuthGuard } from './pss-internal-auth.guard';
import { PSS_CLIENT } from './pss-client.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([FlightInstance, FareRule, Passenger, Airport]),
    BookingEngineModule,
  ],
  controllers: [CoreItineraryController],
  providers: [
    HttpPssClient,
    CoreItineraryService,
    PssInternalAuthGuard,
    { provide: PSS_CLIENT, useExisting: HttpPssClient },
  ],
  exports: [PSS_CLIENT],
})
export class PssModule {}
