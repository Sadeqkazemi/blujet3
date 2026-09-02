import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { AgencyDocument } from '../../database/entities/agency-document.entity';
import { AgencyCreditRequest } from '../../database/entities/agency-credit-request.entity';
import { AgencyWebserviceRequest } from '../../database/entities/agency-webservice-request.entity';
import { AgencyAllotment } from '../../database/entities/agency-allotment.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { User } from '../../database/entities/user.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { AgencySeatCommitment } from '../../database/entities/agency-seat-commitment.entity';
import { CharterCommitment } from '../../database/entities/charter-commitment.entity';
import { AgencySeatRequest } from '../../database/entities/agency-seat-request.entity';
import { AgencySeatRequestFlight } from '../../database/entities/agency-seat-request-flight.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { AgencyPortalController } from './agency-portal.controller';
import { AgencyPortalService } from './agency-portal.service';
import { AuditModule } from '../audit/audit.module';
import { CartableModule } from '../cartable/cartable.module';
import { AgenciesModule } from '../agencies/agencies.module';
import { FilesModule } from '../files/files.module';
import { WebservicePricingModule } from '../webservice-pricing/webservice-pricing.module';
import { BookingEngineModule } from '../booking-engine/booking-engine.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgencyProfile,
      AgencyDocument,
      AgencyCreditRequest,
      AgencyWebserviceRequest,
      AgencyAllotment,
      LedgerEntry,
      Booking,
      Passenger,
      User,
      FlightInstance,
      AgencySeatCommitment,
      CharterCommitment,
      AgencySeatRequest,
      AgencySeatRequestFlight,
      FareRule,
    ]),
    AuditModule,
    CartableModule,
    AgenciesModule,
    FilesModule,
    WebservicePricingModule,
    BookingEngineModule,
  ],
  controllers: [AgencyPortalController],
  providers: [AgencyPortalService],
  exports: [AgencyPortalService],
})
export class AgencyPortalModule {}
