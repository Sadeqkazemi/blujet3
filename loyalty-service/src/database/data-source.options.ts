import type { DataSourceOptions } from 'typeorm';
import { loyaltyEntities } from './loyalty-entities';
import { CreateLoyaltyDatabase1793088060000 } from './migrations/1793088060000-CreateLoyaltyDatabase';

export const loyaltyMigrations = [CreateLoyaltyDatabase1793088060000];

export function loyaltyMigrationDataSourceOptions(
  databaseUrl: string | undefined,
): DataSourceOptions {
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('LOYALTY_DATABASE_URL is required');
  }
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: loyaltyEntities,
    migrations: loyaltyMigrations,
    migrationsTableName: 'loyalty_migrations',
    synchronize: false,
    logging: false,
  };
}
