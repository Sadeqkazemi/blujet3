import { Module } from '@nestjs/common';
import { OrderBookingController } from './order-booking.controller';
import { OrderBookingInternalAuthGuard } from './order-booking-internal-auth.guard';
import { OrderBookingReadService } from './order-booking-read.service';

@Module({
  controllers: [OrderBookingController],
  providers: [OrderBookingReadService, OrderBookingInternalAuthGuard],
})
export class OrderBookingModule {}
