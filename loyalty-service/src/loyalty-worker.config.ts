import type { DataSourceOptions } from 'typeorm';
import { loyaltyEntities } from './database/loyalty-entities';
import { loyaltyKafkaConsumerConfig } from './loyalty-kafka.config';

const PORT_PATTERN = /^\d{1,5}$/;

function projectionDatabaseUrl(env: Record<string, unknown>): string {
  const value = env.LOYALTY_PROJECTION_DATABASE_URL;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('LOYALTY_PROJECTION_DATABASE_URL is required');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid Loyalty projection database configuration');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Loyalty projection worker requires PostgreSQL');
  }
  return value;
}

export function validateLoyaltyWorkerEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  if (!['development', 'test', 'production'].includes(String(env.NODE_ENV))) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  projectionDatabaseUrl(env);
  const port = env.PORT ?? '3510';
  if (
    typeof port !== 'string' ||
    !PORT_PATTERN.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65_535
  ) {
    throw new Error('PORT must be between 1 and 65535');
  }
  const kafka = loyaltyKafkaConsumerConfig(env);
  if (!kafka.enabled) {
    throw new Error('LOYALTY_KAFKA_CONSUMER_ENABLED must be true');
  }
  return env;
}

export function loyaltyWorkerDataSourceOptions(
  env: Record<string, unknown> = process.env,
): DataSourceOptions {
  return {
    type: 'postgres',
    url: projectionDatabaseUrl(env),
    entities: loyaltyEntities,
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
