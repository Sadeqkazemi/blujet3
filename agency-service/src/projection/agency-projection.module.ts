import { Module } from '@nestjs/common';
import { AGENCY_DLQ_CONFIG, agencyDlqConfig } from '../agency-dlq.config';
import { AgencyDlqAuthGuard } from './agency-dlq-auth.guard';
import { AgencyDlqController } from './agency-dlq.controller';
import { AgencyDlqStore } from './agency-dlq.store';
import { AgencyKafkaHandler } from './agency-kafka.handler';
import { AgencyProjectionConsumer } from './agency-projection.consumer';
import { AgencyProjectionStore } from './agency-projection.store';

@Module({
  controllers: [AgencyDlqController],
  providers: [
    AgencyProjectionStore,
    AgencyProjectionConsumer,
    AgencyDlqStore,
    AgencyDlqAuthGuard,
    { provide: AGENCY_DLQ_CONFIG, useFactory: agencyDlqConfig },
    AgencyKafkaHandler,
  ],
  exports: [
    AgencyProjectionConsumer,
    AgencyKafkaHandler,
    AgencyProjectionStore,
    AgencyDlqStore,
    AGENCY_DLQ_CONFIG,
  ],
})
export class AgencyProjectionModule {}
