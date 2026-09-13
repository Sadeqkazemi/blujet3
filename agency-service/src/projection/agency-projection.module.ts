import { Module } from '@nestjs/common';
import { AgencyProjectionConsumer } from './agency-projection.consumer';
import { AgencyProjectionStore } from './agency-projection.store';

@Module({
  providers: [AgencyProjectionStore, AgencyProjectionConsumer],
  exports: [AgencyProjectionConsumer],
})
export class AgencyProjectionModule {}
