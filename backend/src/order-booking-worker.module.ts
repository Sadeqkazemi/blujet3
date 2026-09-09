import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  orderBookingWorkerDataSourceOptions,
  validateOrderBookingWorkerEnv,
} from './config/order-booking-worker.config';
import { OrderBookingModule } from './modules/order-booking/order-booking.module';
import { OrderBookingWorkerHealthController } from './order-booking-worker-health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateOrderBookingWorkerEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        customProps: () => ({ service: 'blujet-order-booking' }),
        redact: ['req.headers.x-internal-token'],
      },
    }),
    TypeOrmModule.forRoot(orderBookingWorkerDataSourceOptions()),
    OrderBookingModule,
  ],
  controllers: [OrderBookingWorkerHealthController],
})
export class OrderBookingWorkerModule {}
