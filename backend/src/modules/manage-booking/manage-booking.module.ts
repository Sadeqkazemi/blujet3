import { Module } from '@nestjs/common';
import { ManageBookingController } from './manage-booking.controller';
import { BookingEngineModule } from '../booking-engine/booking-engine.module';
import { RefundsModule } from '../refunds/refunds.module';

@Module({
  imports: [BookingEngineModule, RefundsModule],
  controllers: [ManageBookingController],
})
export class ManageBookingModule {}
