import { Module } from '@nestjs/common';
import {
  OPS_ADMIN_DLQ_CONFIG,
  opsAdminDlqConfig,
} from '../../config/ops-admin-dlq.config';
import { opsAdminKafkaConsumerConfig } from '../../config/ops-admin-kafka-consumer.config';
import { OpsAdminDlqAuthGuard } from './ops-admin-dlq-auth.guard';
import { OpsAdminDlqController } from './ops-admin-dlq.controller';
import { OpsAdminDlqStore } from './ops-admin-dlq.store';
import { OpsAdminKafkaHandler } from './ops-admin-kafka.handler';
import {
  createOpsAdminKafkaClient,
  OPS_ADMIN_KAFKA_CLIENT,
  OPS_ADMIN_KAFKA_CONFIG,
  OpsAdminKafkaRuntime,
} from './ops-admin-kafka.runtime';
import { OpsAdminProjectionConsumer } from './ops-admin-projection.consumer';
import { OpsAdminProjectionStore } from './ops-admin-projection.store';

@Module({
  controllers: [OpsAdminDlqController],
  providers: [
    OpsAdminProjectionStore,
    OpsAdminProjectionConsumer,
    OpsAdminDlqStore,
    OpsAdminDlqAuthGuard,
    OpsAdminKafkaHandler,
    OpsAdminKafkaRuntime,
    {
      provide: OPS_ADMIN_DLQ_CONFIG,
      useFactory: opsAdminDlqConfig,
    },
    {
      provide: OPS_ADMIN_KAFKA_CONFIG,
      useFactory: opsAdminKafkaConsumerConfig,
    },
    {
      provide: OPS_ADMIN_KAFKA_CLIENT,
      useFactory: createOpsAdminKafkaClient,
      inject: [OPS_ADMIN_KAFKA_CONFIG],
    },
  ],
  exports: [OpsAdminKafkaRuntime, OpsAdminDlqStore, OPS_ADMIN_DLQ_CONFIG],
})
export class OpsAdminProjectionKafkaModule {}
