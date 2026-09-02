import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Passenger } from '../../database/entities/passenger.entity';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import { PassengerReportsController } from './passenger-reports.controller';
import { PassengerReportsService } from './passenger-reports.service';
import { PanelsModule } from '../panels/panels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Passenger, AircraftSeatMap]),
    PanelsModule,
  ],
  controllers: [PassengerReportsController],
  providers: [PassengerReportsService],
})
export class PassengerReportsModule {}
