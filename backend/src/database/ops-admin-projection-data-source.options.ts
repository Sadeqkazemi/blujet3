import type { DataSourceOptions } from 'typeorm';
import { OpsAdminCartableTaskProjection } from './ops-admin-projection-entities/ops-admin-cartable-task.entity';
import { OpsAdminCartableEventReceipt } from './ops-admin-projection-entities/ops-admin-cartable-event-receipt.entity';
import { OpsAdminKafkaConsumerCheckpoint } from './ops-admin-projection-entities/ops-admin-kafka-consumer-checkpoint.entity';
import { OpsAdminKafkaProcessingFailure } from './ops-admin-projection-entities/ops-admin-kafka-processing-failure.entity';
import { CreateOpsAdminProjectionDatabase1793088360000 } from './ops-admin-migrations/1793088360000-CreateOpsAdminProjectionDatabase';
import { OpsAdminProjectionInbox1793260800000 } from './ops-admin-migrations/1793260800000-OpsAdminProjectionInbox';
import { OpsAdminKafkaConsumerCheckpoints1794038400000 } from './ops-admin-migrations/1794038400000-OpsAdminKafkaConsumerCheckpoints';
import { OpsAdminKafkaFailureQuarantine1794124800000 } from './ops-admin-migrations/1794124800000-OpsAdminKafkaFailureQuarantine';

export const opsAdminProjectionEntities = [
  OpsAdminCartableTaskProjection,
  OpsAdminCartableEventReceipt,
  OpsAdminKafkaConsumerCheckpoint,
  OpsAdminKafkaProcessingFailure,
];
export const opsAdminProjectionMigrations = [
  CreateOpsAdminProjectionDatabase1793088360000,
  OpsAdminProjectionInbox1793260800000,
  OpsAdminKafkaConsumerCheckpoints1794038400000,
  OpsAdminKafkaFailureQuarantine1794124800000,
];

export function opsAdminProjectionDataSourceOptions(
  databaseUrl: string | undefined,
): DataSourceOptions {
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('OPS_ADMIN_PROJECTION_DATABASE_URL is required');
  }

  return {
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    logging: false,
    entities: opsAdminProjectionEntities,
    migrations: opsAdminProjectionMigrations,
    migrationsTableName: 'ops_admin_projection_migrations',
  };
}
