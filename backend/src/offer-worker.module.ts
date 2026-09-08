import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  offerWorkerDataSourceOptions,
  validateOfferWorkerEnv,
} from './config/offer-worker.config';
import { AircraftSeatMap } from './database/entities/aircraft-seat-map.entity';
import { Airport } from './database/entities/airport.entity';
import { AncillaryService } from './database/entities/ancillary-service.entity';
import { CoreItinerarySegment } from './database/entities/core-itinerary-segment.entity';
import { FareRule } from './database/entities/fare-rule.entity';
import { FlightInstance } from './database/entities/flight-instance.entity';
import { Passenger } from './database/entities/passenger.entity';
import { SeatLock } from './database/entities/seat-lock.entity';
import { TravelExtraSetting } from './database/entities/travel-extra-setting.entity';
import { OfferCabinAvailabilityService } from './modules/offer-pricing/offer-cabin-availability.service';
import { OfferInternalAuthGuard } from './modules/offer-pricing/offer-internal-auth.guard';
import { OfferPricingController } from './modules/offer-pricing/offer-pricing.controller';
import { OfferTravelExtraPricingService } from './modules/offer-pricing/offer-travel-extra-pricing.service';
import { CABIN_AVAILABILITY_READER } from './modules/pss/cabin-availability-reader.interface';
import { CoreItineraryQuoteService } from './modules/pss/core-itinerary-quote.service';
import { CoreItineraryService } from './modules/pss/core-itinerary.service';
import { CoreOfferPricingService } from './modules/pss/core-offer-pricing.service';
import { TRAVEL_EXTRA_PRICING } from './modules/pss/travel-extra-pricing.interface';
import { OfferWorkerHealthController } from './offer-worker-health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateOfferWorkerEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        customProps: () => ({ service: 'blujet-offer-pricing' }),
        redact: [
          'req.headers.authorization',
          'req.headers.x-internal-token',
          'req.body.integrityToken',
        ],
      },
    }),
    TypeOrmModule.forRoot(offerWorkerDataSourceOptions()),
    TypeOrmModule.forFeature([
      AircraftSeatMap,
      Airport,
      AncillaryService,
      CoreItinerarySegment,
      FareRule,
      FlightInstance,
      Passenger,
      SeatLock,
      TravelExtraSetting,
    ]),
  ],
  controllers: [OfferPricingController, OfferWorkerHealthController],
  providers: [
    CoreItineraryService,
    CoreItineraryQuoteService,
    CoreOfferPricingService,
    OfferCabinAvailabilityService,
    OfferTravelExtraPricingService,
    OfferInternalAuthGuard,
    {
      provide: CABIN_AVAILABILITY_READER,
      useExisting: OfferCabinAvailabilityService,
    },
    {
      provide: TRAVEL_EXTRA_PRICING,
      useExisting: OfferTravelExtraPricingService,
    },
  ],
})
export class OfferWorkerModule {}
