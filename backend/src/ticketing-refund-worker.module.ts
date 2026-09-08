import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ticketingRefundWorkerDataSourceOptions,
  validateTicketingRefundWorkerEnv,
} from './config/ticketing-refund-worker.config';
import { AgencyProfile } from './database/entities/agency-profile.entity';
import { CoreItineraryCouponEvent } from './database/entities/core-itinerary-coupon-event.entity';
import { CoreItineraryFlightCoupon } from './database/entities/core-itinerary-flight-coupon.entity';
import { CoreItineraryOrder } from './database/entities/core-itinerary-order.entity';
import { CoreItineraryRefund } from './database/entities/core-itinerary-refund.entity';
import { CoreItinerarySegment } from './database/entities/core-itinerary-segment.entity';
import { CoreItineraryTicketDocument } from './database/entities/core-itinerary-ticket-document.entity';
import { CoreItineraryTraveller } from './database/entities/core-itinerary-traveller.entity';
import { CoreItineraryTravellerSegment } from './database/entities/core-itinerary-traveller-segment.entity';
import { Flight } from './database/entities/flight.entity';
import { FlightInstance } from './database/entities/flight-instance.entity';
import { LedgerEntry } from './database/entities/ledger-entry.entity';
import { RefundPenaltyRule } from './database/entities/refund-penalty-rule.entity';
import { Route } from './database/entities/route.entity';
import { CoreItineraryRefundService } from './modules/pss/core-itinerary-refund.service';
import { CoreItineraryRetrievalService } from './modules/pss/core-itinerary-retrieval.service';
import { TicketingRefundInternalAuthGuard } from './modules/ticketing-refund/ticketing-refund-internal-auth.guard';
import { TicketingRefundController } from './modules/ticketing-refund/ticketing-refund.controller';
import { TicketingRefundWorkerHealthController } from './ticketing-refund-worker-health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateTicketingRefundWorkerEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        customProps: () => ({ service: 'blujet-ticketing-refund' }),
        redact: ['req.headers.x-internal-token', 'req.body.ownerId'],
      },
    }),
    TypeOrmModule.forRoot(ticketingRefundWorkerDataSourceOptions()),
    TypeOrmModule.forFeature([
      AgencyProfile,
      CoreItineraryCouponEvent,
      CoreItineraryFlightCoupon,
      CoreItineraryOrder,
      CoreItineraryRefund,
      CoreItinerarySegment,
      CoreItineraryTicketDocument,
      CoreItineraryTraveller,
      CoreItineraryTravellerSegment,
      Flight,
      FlightInstance,
      LedgerEntry,
      RefundPenaltyRule,
      Route,
    ]),
  ],
  controllers: [
    TicketingRefundController,
    TicketingRefundWorkerHealthController,
  ],
  providers: [
    CoreItineraryRefundService,
    CoreItineraryRetrievalService,
    TicketingRefundInternalAuthGuard,
  ],
})
export class TicketingRefundWorkerModule {}
