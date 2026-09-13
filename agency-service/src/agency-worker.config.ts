import type { DataSourceOptions } from 'typeorm';
import { agencyKafkaConsumerConfig } from './agency-kafka.config';
import { agencyProjectionEntities } from './database/agency-entities';

const PORT_PATTERN = /^\d{1,5}$/;

function projectionDatabaseUrl(env: Record<string, unknown>): string {
  const value = env.AGENCY_PROJECTION_DATABASE_URL;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('AGENCY_PROJECTION_DATABASE_URL is required');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid Agency projection database configuration');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Agency projection worker requires PostgreSQL');
  }
  return value;
}

export function validateAgencyWorkerEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  if (!['development', 'test', 'production'].includes(String(env.NODE_ENV))) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  projectionDatabaseUrl(env);
  const port = env.PORT ?? '3610';
  if (
    typeof port !== 'string' ||
    !PORT_PATTERN.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65_535
  ) {
    throw new Error('PORT must be between 1 and 65535');
  }
  const kafka = agencyKafkaConsumerConfig(env);
  if (!kafka.enabled) {
    throw new Error('AGENCY_KAFKA_CONSUMER_ENABLED must be true');
  }
  return env;
}

export function agencyWorkerDataSourceOptions(
  env: Record<string, unknown> = process.env,
): DataSourceOptions {
  return {
    type: 'postgres',
    url: projectionDatabaseUrl(env),
    entities: agencyProjectionEntities,
    synchronize: false,
    migrationsRun: false,
    logging: false,
    extra: {
      max: 4,
      connectionTimeoutMillis: 2000,
      statement_timeout: 2000,
      options: '-c timezone=UTC',
    },
  };
}
