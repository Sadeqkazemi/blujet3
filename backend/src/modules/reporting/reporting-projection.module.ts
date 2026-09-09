import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { reportingKafkaConsumerConfig } from '../../config/reporting-kafka-consumer.config';
import {
  REPORTING_DLQ_CONFIG,
  reportingDlqConfig,
} from '../../config/reporting-dlq.config';
import { ReportingItineraryEventProjection } from '../../database/entities/reporting-itinerary-event-projection.entity';
import { ReportingItineraryEventReceipt } from '../../database/entities/reporting-itinerary-event-receipt.entity';
import { ReportingKafkaConsumerCheckpoint } from '../../database/entities/reporting-kafka-consumer-checkpoint.entity';
import { ReportingKafkaProcessingFailure } from '../../database/entities/reporting-kafka-processing-failure.entity';
import {
  REPORTING_READ_MODEL_SINK,
  ReportingEventConsumer,
} from './reporting-event-consumer';
import { ReportingItineraryProjectionStore } from './reporting-itinerary-projection.store';
import { ReportingKafkaHandler } from './reporting-kafka.handler';
import { ReportingDlqStore } from './reporting-dlq.store';
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
      ReportingKafkaProcessingFailure,
    ]),
  ],
  providers: [
    ReportingItineraryProjectionStore,
    ReportingEventConsumer,
    ReportingKafkaHandler,
    ReportingDlqStore,
    ReportingKafkaRuntime,
    {
      provide: REPORTING_DLQ_CONFIG,
      useFactory: reportingDlqConfig,
    },
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
    ReportingDlqStore,
    REPORTING_DLQ_CONFIG,
  ],
})
export class ReportingProjectionModule {}
