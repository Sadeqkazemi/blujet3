import { Module } from '@nestjs/common';
import { agencyKafkaConsumerConfig } from '../agency-kafka.config';
import { AgencyProjectionModule } from './agency-projection.module';
import {
  AGENCY_KAFKA_CLIENT,
  AGENCY_KAFKA_CONFIG,
  AgencyKafkaRuntime,
  createAgencyKafkaClient,
} from './agency-kafka.runtime';

@Module({
  imports: [AgencyProjectionModule],
  providers: [
    {
      provide: AGENCY_KAFKA_CONFIG,
      useFactory: () => agencyKafkaConsumerConfig(),
    },
    {
      provide: AGENCY_KAFKA_CLIENT,
      inject: [AGENCY_KAFKA_CONFIG],
      useFactory: createAgencyKafkaClient,
    },
    AgencyKafkaRuntime,
  ],
  exports: [AgencyKafkaRuntime],
})
export class AgencyKafkaRuntimeModule {}
