import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Airport } from '../../database/entities/airport.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import { SeatLock } from '../../database/entities/seat-lock.entity';
import { User } from '../../database/entities/user.entity';
import { PriceLock } from '../../database/entities/price-lock.entity';
import { PaymentReconciliation } from '../../database/entities/payment-reconciliation.entity';
import { PayIdempotencyRecord } from '../../database/entities/pay-idempotency-record.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { PromoCode } from '../../database/entities/promo-code.entity';
import { PromoRedemption } from '../../database/entities/promo-redemption.entity';
import { WalletEntry } from '../../database/entities/wallet-entry.entity';
import { ClubMember } from '../../database/entities/club-member.entity';
import { ClubPointsEntry } from '../../database/entities/club-points-entry.entity';
import { ClubTierRule } from '../../database/entities/club-tier-rule.entity';
import { SavedFlight } from '../../database/entities/saved-flight.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { CabinFare } from '../../database/entities/cabin-fare.entity';
import { FarePricingProposal } from '../../database/entities/fare-pricing-proposal.entity';
import { RefundRequest } from '../../database/entities/refund-request.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { AgencyAllotment } from '../../database/entities/agency-allotment.entity';
import { AgencyCreditLine } from '../../database/entities/agency-credit-line.entity';
import { AgencyInvoice } from '../../database/entities/agency-invoice.entity';
import { TravelExtraSetting } from '../../database/entities/travel-extra-setting.entity';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchAdvisoryService } from './search-advisory.service';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { WalletPointsLockController } from './wallet-points-lock.controller';
import { WalletService } from './wallet.service';
import { ClubPointsService } from './club-points.service';
import { PriceLockService } from './price-lock.service';
import { SavedFlightsService } from './saved-flights.service';
import { MySavedFlightsController } from './my-saved-flights.controller';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';
import { AuditModule } from '../audit/audit.module';
import { AiModule } from '../ai/ai.module';
import { CustomerReferralsModule } from '../customer-referrals/customer-referrals.module';
import { AncillaryServicesModule } from '../ancillary-services/ancillary-services.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  PAYMENT_GATEWAY,
  SandboxPaymentGateway,
  UnavailablePaymentGateway,
} from './payment-gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Airport,
      Booking,
      Passenger,
      FlightInstance,
      AircraftSeatMap,
      SeatLock,
      User,
      PriceLock,
      PaymentReconciliation,
      PayIdempotencyRecord,
      LedgerEntry,
      PromoCode,
      PromoRedemption,
      WalletEntry,
      ClubMember,
      ClubPointsEntry,
      ClubTierRule,
      SavedFlight,
      FareRule,
      CabinFare,
      FarePricingProposal,
      RefundRequest,
      RefreshToken,
      AgencyAllotment,
      AgencyCreditLine,
      AgencyInvoice,
      TravelExtraSetting,
    ]),
    AuditModule,
    CustomerReferralsModule,
    AncillaryServicesModule,
    AiModule,
    NotificationsModule,
  ],
  controllers: [
    SearchController,
    BookingController,
    WalletPointsLockController,
    MySavedFlightsController,
    PrivacyController,
  ],
  providers: [
    SearchService,
    SearchAdvisoryService,
    BookingService,
    WalletService,
    ClubPointsService,
    PriceLockService,
    SavedFlightsService,
    PrivacyService,
    // PAYMENT_GATEWAY env var selects the driver; sandbox is the only one
    // until a real Shetab/PSP contract exists — the interface is final.
    SandboxPaymentGateway,
    UnavailablePaymentGateway,
    {
      provide: PAYMENT_GATEWAY,
      inject: [SandboxPaymentGateway, UnavailablePaymentGateway],
      useFactory: (
        sandbox: SandboxPaymentGateway,
        unavailable: UnavailablePaymentGateway,
      ) => {
        const selected = process.env.PAYMENT_GATEWAY?.toLowerCase();
        const production = process.env.NODE_ENV === 'production';
        if (!production && (selected === 'sandbox' || !selected))
          return sandbox;
        return unavailable;
      },
    },
  ],
  exports: [SearchService, BookingService],
})
export class BookingEngineModule {}
