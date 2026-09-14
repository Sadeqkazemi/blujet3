import { Module } from '@nestjs/common';
import { OpsAdminController } from './ops-admin.controller';
import { OpsAdminInternalAuthGuard } from './ops-admin-internal-auth.guard';
import { OpsAdminKafkaHandler } from './ops-admin-kafka.handler';
import { OpsAdminProjectionConsumer } from './ops-admin-projection.consumer';
import { OpsAdminProjectionStore } from './ops-admin-projection.store';
import { OpsAdminReadService } from './ops-admin-read.service';

@Module({
  controllers: [OpsAdminController],
  providers: [
    OpsAdminReadService,
    OpsAdminInternalAuthGuard,
    OpsAdminProjectionStore,
    OpsAdminProjectionConsumer,
    OpsAdminKafkaHandler,
  ],
  exports: [OpsAdminProjectionConsumer, OpsAdminKafkaHandler],
})
export class OpsAdminModule {}
