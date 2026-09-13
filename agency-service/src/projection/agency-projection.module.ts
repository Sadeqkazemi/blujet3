import { Module } from '@nestjs/common';
import { AgencyKafkaHandler } from './agency-kafka.handler';
import { AgencyProjectionConsumer } from './agency-projection.consumer';
import { AgencyProjectionStore } from './agency-projection.store';

@Module({
  providers: [
    AgencyProjectionStore,
    AgencyProjectionConsumer,
    AgencyKafkaHandler,
  ],
  exports: [AgencyProjectionConsumer, AgencyKafkaHandler],
})
export class AgencyProjectionModule {}
