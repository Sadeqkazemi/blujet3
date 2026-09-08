import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { reportingKafkaConsumerConfig } from '../../config/reporting-kafka-consumer.config';
import { ReportingItineraryEventProjection } from '../../database/entities/reporting-itinerary-event-projection.entity';
import { ReportingItineraryEventReceipt } from '../../database/entities/reporting-itinerary-event-receipt.entity';
import { ReportingKafkaConsumerCheckpoint } from '../../database/entities/reporting-kafka-consumer-checkpoint.entity';
import {
  REPORTING_READ_MODEL_SINK,
  ReportingEventConsumer,
} from './reporting-event-consumer';
import { ReportingItineraryProjectionStore } from './reporting-itinerary-projection.store';
import { ReportingKafkaHandler } from './reporting-kafka.handler';
import {
  createReportingKafkaClient,
  REPORTING_KAFKA_CLIENT,
  REPORTING_KAFKA_CONFIG,
  ReportingKafkaRuntime,
} from './reporting-kafka.runtime';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportingItineraryEventProjection,
      ReportingItineraryEventReceipt,
      ReportingKafkaConsumerCheckpoint,
    ]),
  ],
  providers: [
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
export class ReportingProjectionModule {}
