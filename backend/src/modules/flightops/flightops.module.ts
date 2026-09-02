import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { Booking } from '../../database/entities/booking.entity';
import { User } from '../../database/entities/user.entity';
import { FlightopsService } from './flightops.service';
import { FlightopsController } from './flightops.controller';
import { NiraModule } from '../nira/nira.module';
import { PanelsModule } from '../panels/panels.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FlightInstance, Passenger, Booking, User]),
    NiraModule,
    PanelsModule,
    AuthModule,
    NotificationsModule,
  ],
  controllers: [FlightopsController],
  providers: [FlightopsService],
})
export class FlightopsModule {}
