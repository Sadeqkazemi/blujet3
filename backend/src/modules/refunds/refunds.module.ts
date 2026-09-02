import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefundRequest } from '../../database/entities/refund-request.entity';
import { RefundPenaltyRule } from '../../database/entities/refund-penalty-rule.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { User } from '../../database/entities/user.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { RefundsController } from './refunds.controller';
import { RefundsCustomerController } from './refunds-customer.controller';
import { RefundsService } from './refunds.service';
import { PanelsModule } from '../panels/panels.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BookingEngineModule } from '../booking-engine/booking-engine.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RefundRequest,
      RefundPenaltyRule,
      Booking,
      Passenger,
      FlightInstance,
      User,
      LedgerEntry,
    ]),
    PanelsModule,
    AuditModule,
    AuthModule,
    NotificationsModule,
    BookingEngineModule,
  ],
  controllers: [RefundsController, RefundsCustomerController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
