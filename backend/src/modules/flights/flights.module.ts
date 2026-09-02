import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Flight } from '../../database/entities/flight.entity';
import { Route } from '../../database/entities/route.entity';
import { Airport } from '../../database/entities/airport.entity';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import { AircraftDefinition } from '../../database/entities/aircraft-definition.entity';
import { AircraftCabin } from '../../database/entities/aircraft-cabin.entity';
import { AircraftSeat } from '../../database/entities/aircraft-seat.entity';
import { CharterCommitment } from '../../database/entities/charter-commitment.entity';
import { AgencySeatCommitment } from '../../database/entities/agency-seat-commitment.entity';
import { Schedule } from '../../database/entities/schedule.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { AgencyAllotment } from '../../database/entities/agency-allotment.entity';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { SeatLock } from '../../database/entities/seat-lock.entity';
import { PriceLock } from '../../database/entities/price-lock.entity';
import { FarePricingProposal } from '../../database/entities/fare-pricing-proposal.entity';
import { FlightChargeRule } from '../../database/entities/flight-charge-rule.entity';
import { FlightReview } from '../../database/entities/flight-review.entity';
import { FlightScheduleTemplate } from '../../database/entities/flight-schedule-template.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User } from '../../database/entities/user.entity';
import { WalletEntry } from '../../database/entities/wallet-entry.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { FlightsController } from './flights.controller';
import { FlightsService } from './flights.service';
import { FlightDefinitionService } from './flight-definition.service';
import { FlightWorkflowService } from './flight-workflow.service';
import { ScheduleTemplateService } from './schedule-template.service';
import { AircraftService } from './aircraft.service';
import { CommitmentsService } from './commitments.service';
import { PanelsModule } from '../panels/panels.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FlightInstance,
      Flight,
      Route,
      Airport,
      AircraftSeatMap,
      AircraftDefinition,
      AircraftCabin,
      AircraftSeat,
      CharterCommitment,
      AgencySeatCommitment,
      Schedule,
      FareRule,
      AgencyAllotment,
      AgencyProfile,
      Booking,
      Passenger,
      SeatLock,
      PriceLock,
      FarePricingProposal,
      FlightChargeRule,
      FlightReview,
      FlightScheduleTemplate,
      AuditLog,
      User,
      WalletEntry,
      LedgerEntry,
    ]),
    PanelsModule,
    AuditModule,
    NotificationsModule,
    AiModule,
    AuthModule,
    SmsModule,
  ],
  controllers: [FlightsController],
  providers: [
    FlightsService,
    FlightDefinitionService,
    FlightWorkflowService,
    ScheduleTemplateService,
    AircraftService,
    CommitmentsService,
  ],
  exports: [FlightsService, FlightDefinitionService, FlightWorkflowService],
})
export class FlightsModule {}
