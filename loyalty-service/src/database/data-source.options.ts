import type { DataSourceOptions } from 'typeorm';
import { loyaltyEntities } from './loyalty-entities';
import { CreateLoyaltyDatabase1793088060000 } from './migrations/1793088060000-CreateLoyaltyDatabase';
import { LoyaltyProjectionVersions1793347200000 } from './migrations/1793347200000-LoyaltyProjectionVersions';
import { LoyaltyProjectionInbox1793516400000 } from './migrations/1793516400000-LoyaltyProjectionInbox';

export const loyaltyMigrations = [
  CreateLoyaltyDatabase1793088060000,
  LoyaltyProjectionVersions1793347200000,
  LoyaltyProjectionInbox1793516400000,
];

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
