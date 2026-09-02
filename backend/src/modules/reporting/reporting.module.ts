import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { AgencyInvoice } from '../../database/entities/agency-invoice.entity';
import { AgencyMembershipRequest } from '../../database/entities/agency-membership-request.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { Booking } from '../../database/entities/booking.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Airport } from '../../database/entities/airport.entity';
import { RefundRequest } from '../../database/entities/refund-request.entity';
import { SupportTicket } from '../../database/entities/support-ticket.entity';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { PanelsModule } from '../panels/panels.module';
import { AgenciesModule } from '../agencies/agencies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LedgerEntry,
      AgencyProfile,
      AgencyInvoice,
      AgencyMembershipRequest,
      Passenger,
      Booking,
      FlightInstance,
      Airport,
      RefundRequest,
      SupportTicket,
    ]),
    PanelsModule,
    AgenciesModule,
  ],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
