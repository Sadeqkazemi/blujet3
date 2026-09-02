import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeatLock } from '../../database/entities/seat-lock.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Flight } from '../../database/entities/flight.entity';
import { Airport } from '../../database/entities/airport.entity';
import { FarePricingProposal } from '../../database/entities/fare-pricing-proposal.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { InternalService } from '../../database/entities/internal-service.entity';
import { AgencyApiKey } from '../../database/entities/agency-api-key.entity';
import { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { SeatmapController } from './seatmap.controller';
import { SeatmapService } from './seatmap.service';
import { PnrController } from './pnr.controller';
import { PnrService } from './pnr.service';
import { AuditModule } from '../audit/audit.module';
import { PanelsModule } from '../panels/panels.module';
import { BookingEngineModule } from '../booking-engine/booking-engine.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SeatLock,
      FlightInstance,
      AircraftSeatMap,
      Passenger,
      Booking,
      Flight,
      Airport,
      FarePricingProposal,
      LedgerEntry,
      InternalService,
      AgencyApiKey,
      AgencyProfile,
    ]),
    AuditModule,
    PanelsModule,
    BookingEngineModule,
  ],
  controllers: [SeatmapController, PnrController],
  providers: [SeatmapService, PnrService],
})
export class ReservationModule {}
