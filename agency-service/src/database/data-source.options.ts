import type { DataSourceOptions } from 'typeorm';
import { agencyProjectionEntities } from './agency-entities';
import { CreateAgencyProjectionDatabase1793088120000 } from './migrations/1793088120000-CreateAgencyProjectionDatabase';
import { AgencyVersionedProjection1793865600000 } from './migrations/1793865600000-AgencyVersionedProjection';
import { AgencyKafkaConsumerCheckpoints1793952000000 } from './migrations/1793952000000-AgencyKafkaConsumerCheckpoints';
import { AgencyKafkaFailureQuarantine1794038400000 } from './migrations/1794038400000-AgencyKafkaFailureQuarantine';

export const agencyProjectionMigrations = [
  CreateAgencyProjectionDatabase1793088120000,
  AgencyVersionedProjection1793865600000,
  AgencyKafkaConsumerCheckpoints1793952000000,
  AgencyKafkaFailureQuarantine1794038400000,
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
