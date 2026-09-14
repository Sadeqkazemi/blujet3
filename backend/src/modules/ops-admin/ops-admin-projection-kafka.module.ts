import { Module } from '@nestjs/common';
import { opsAdminKafkaConsumerConfig } from '../../config/ops-admin-kafka-consumer.config';
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
  providers: [
    OpsAdminProjectionStore,
    OpsAdminProjectionConsumer,
    OpsAdminKafkaHandler,
    OpsAdminKafkaRuntime,
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
  exports: [OpsAdminKafkaRuntime],
})
export class OpsAdminProjectionKafkaModule {}
