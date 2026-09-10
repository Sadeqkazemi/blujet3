import type { DataSourceOptions } from 'typeorm';
import { agencyProjectionEntities } from './agency-entities';
import { CreateAgencyProjectionDatabase1793088120000 } from './migrations/1793088120000-CreateAgencyProjectionDatabase';

export const agencyProjectionMigrations = [
  CreateAgencyProjectionDatabase1793088120000,
];

export function agencyMigrationDataSourceOptions(
  databaseUrl: string | undefined,
): DataSourceOptions {
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('AGENCY_DATABASE_URL is required');
  }
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: agencyProjectionEntities,
    migrations: agencyProjectionMigrations,
    migrationsTableName: 'agency_projection_migrations',
    synchronize: false,
    logging: false,
  };
}
