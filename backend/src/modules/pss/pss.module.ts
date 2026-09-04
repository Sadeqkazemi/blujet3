import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Airport } from '../../database/entities/airport.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { TravelExtraSetting } from '../../database/entities/travel-extra-setting.entity';
import { CoreItineraryOrder } from '../../database/entities/core-itinerary-order.entity';
import { CoreItinerarySegment } from '../../database/entities/core-itinerary-segment.entity';
import { CoreItineraryTraveller } from '../../database/entities/core-itinerary-traveller.entity';
import { CoreItineraryTravellerSegment } from '../../database/entities/core-itinerary-traveller-segment.entity';
import { CoreItineraryPaymentConfirmation } from '../../database/entities/core-itinerary-payment-confirmation.entity';
import { CoreItineraryTicketDocument } from '../../database/entities/core-itinerary-ticket-document.entity';
import { CoreItineraryFlightCoupon } from '../../database/entities/core-itinerary-flight-coupon.entity';
import { CoreItineraryRefund } from '../../database/entities/core-itinerary-refund.entity';
import { CoreItineraryCouponEvent } from '../../database/entities/core-itinerary-coupon-event.entity';
import { RefundPenaltyRule } from '../../database/entities/refund-penalty-rule.entity';
import { AncillaryServicesModule } from '../ancillary-services/ancillary-services.module';
import { BookingEngineModule } from '../booking-engine/booking-engine.module';
import { CoreItineraryController } from './core-itinerary.controller';
import { CoreItineraryService } from './core-itinerary.service';
import { CoreItineraryQuoteService } from './core-itinerary-quote.service';
import { CoreItineraryHoldService } from './core-itinerary-hold.service';
import { CoreItineraryHoldExpiryService } from './core-itinerary-hold-expiry.service';
import { CoreItineraryHoldExpiryWorker } from './core-itinerary-hold-expiry.worker';
import { CoreItineraryCancelService } from './core-itinerary-cancel.service';
import { CoreItineraryPaymentService } from './core-itinerary-payment.service';
import { CoreItineraryRefundService } from './core-itinerary-refund.service';
import { CoreOrderServicingController } from './core-order-servicing.controller';
import { HttpPssClient } from './http-pss.client';
import { PssInternalAuthGuard } from './pss-internal-auth.guard';
import { PSS_CLIENT } from './pss-client.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FlightInstance,
      FareRule,
      Passenger,
      Airport,
      TravelExtraSetting,
      CoreItineraryOrder,
      CoreItinerarySegment,
      CoreItineraryTraveller,
      CoreItineraryTravellerSegment,
      CoreItineraryPaymentConfirmation,
      CoreItineraryTicketDocument,
      CoreItineraryFlightCoupon,
      CoreItineraryRefund,
      CoreItineraryCouponEvent,
      RefundPenaltyRule,
    ]),
    BookingEngineModule,
    AncillaryServicesModule,
  ],
  controllers: [CoreItineraryController, CoreOrderServicingController],
  providers: [
    HttpPssClient,
    CoreItineraryService,
    CoreItineraryQuoteService,
    CoreItineraryHoldService,
    CoreItineraryHoldExpiryService,
    CoreItineraryHoldExpiryWorker,
    CoreItineraryCancelService,
    CoreItineraryPaymentService,
    CoreItineraryRefundService,
    PssInternalAuthGuard,
    { provide: PSS_CLIENT, useExisting: HttpPssClient },
  ],
  exports: [PSS_CLIENT],
})
export class PssModule {}
