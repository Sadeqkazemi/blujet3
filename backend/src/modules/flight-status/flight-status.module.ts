import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Airport } from '../../database/entities/airport.entity';
import { FlightStatusController } from './flight-status.controller';
import { FlightStatusService } from './flight-status.service';

@Module({
  imports: [TypeOrmModule.forFeature([FlightInstance, Airport])],
  controllers: [FlightStatusController],
  providers: [FlightStatusService],
})
export class FlightStatusModule {}
