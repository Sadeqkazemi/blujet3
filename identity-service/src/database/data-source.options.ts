import type { DataSourceOptions } from 'typeorm';
import { identityEntities } from './identity-entities';
import { CreateIdentityDatabase1793088180000 } from './migrations/1793088180000-CreateIdentityDatabase';

export const identityMigrations = [CreateIdentityDatabase1793088180000];

export function identityMigrationDataSourceOptions(
  databaseUrl: string | undefined,
): DataSourceOptions {
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('IDENTITY_DATABASE_URL is required');
  }
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: identityEntities,
    migrations: identityMigrations,
    migrationsTableName: 'identity_migrations',
    synchronize: false,
    logging: false,
  };
}
