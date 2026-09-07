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
import { ReportingItineraryEventProjection } from '../../database/entities/reporting-itinerary-event-projection.entity';
import { ReportingItineraryEventReceipt } from '../../database/entities/reporting-itinerary-event-receipt.entity';
import {
  REPORTING_READ_MODEL_SINK,
  ReportingEventConsumer,
} from './reporting-event-consumer';
import { ReportingItineraryProjectionStore } from './reporting-itinerary-projection.store';
import { ReportingKafkaHandler } from './reporting-kafka.handler';
import { reportingKafkaConsumerConfig } from '../../config/reporting-kafka-consumer.config';
import {
  createReportingKafkaClient,
  REPORTING_KAFKA_CLIENT,
  REPORTING_KAFKA_CONFIG,
  ReportingKafkaRuntime,
} from './reporting-kafka.runtime';

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
      ReportingItineraryEventProjection,
      ReportingItineraryEventReceipt,
    ]),
    PanelsModule,
    AgenciesModule,
  ],
  controllers: [ReportingController],
  providers: [
    ReportingService,
    ReportingItineraryProjectionStore,
    ReportingEventConsumer,
    ReportingKafkaHandler,
    ReportingKafkaRuntime,
    {
      provide: REPORTING_KAFKA_CONFIG,
      useFactory: reportingKafkaConsumerConfig,
    },
    {
      provide: REPORTING_KAFKA_CLIENT,
      useFactory: createReportingKafkaClient,
      inject: [REPORTING_KAFKA_CONFIG],
    },
    {
      provide: REPORTING_READ_MODEL_SINK,
      useExisting: ReportingItineraryProjectionStore,
    },
  ],
  exports: [
    ReportingEventConsumer,
    ReportingKafkaHandler,
    ReportingKafkaRuntime,
  ],
})
export class ReportingModule {}
