import type { DataSourceOptions } from 'typeorm';
import { OpsAdminCartableTaskProjection } from './ops-admin-projection-entities/ops-admin-cartable-task.entity';
import { CreateOpsAdminProjectionDatabase1793088360000 } from './ops-admin-migrations/1793088360000-CreateOpsAdminProjectionDatabase';

export const opsAdminProjectionEntities = [OpsAdminCartableTaskProjection];
export const opsAdminProjectionMigrations = [
  CreateOpsAdminProjectionDatabase1793088360000,
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
