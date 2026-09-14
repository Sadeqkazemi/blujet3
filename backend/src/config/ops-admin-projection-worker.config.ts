import type { DataSourceOptions } from 'typeorm';
import { opsAdminDlqConfig } from './ops-admin-dlq.config';
import { opsAdminKafkaConsumerConfig } from './ops-admin-kafka-consumer.config';
import { opsAdminProjectionDataSourceOptions } from '../database/ops-admin-projection-data-source.options';

const PORT_PATTERN = /^\d{1,5}$/;
const PRODUCTION_ROLE = 'blujet_ops_admin_projection_runtime';

export function validateOpsAdminProjectionWorkerEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  if (!['development', 'test', 'production'].includes(String(env.NODE_ENV))) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  const url = env.OPS_ADMIN_PROJECTION_DATABASE_URL;
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('OPS_ADMIN_PROJECTION_DATABASE_URL is required');
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      'OPS_ADMIN_PROJECTION_DATABASE_URL must be a valid PostgreSQL URL',
    );
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(
      'OPS_ADMIN_PROJECTION_DATABASE_URL must be a valid PostgreSQL URL',
    );
  }
  if (
    env.NODE_ENV === 'production' &&
    decodeURIComponent(parsed.username) !== PRODUCTION_ROLE
  ) {
    throw new Error(
      `OPS_ADMIN_PROJECTION_DATABASE_URL must authenticate as ${PRODUCTION_ROLE}`,
    );
  }
  const port = env.PORT ?? '3670';
  if (
    typeof port !== 'string' ||
    !PORT_PATTERN.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65_535
  ) {
    throw new Error('PORT must be between 1 and 65535');
  }
  const kafka = opsAdminKafkaConsumerConfig(env);
  if (!kafka.enabled) {
    throw new Error('OPS_ADMIN_KAFKA_CONSUMER_ENABLED must be true');
  }
  opsAdminDlqConfig(env);
  return env;
}

export function opsAdminProjectionWorkerDataSourceOptions(
  env: Record<string, unknown> = process.env,
): DataSourceOptions {
  const url = env.OPS_ADMIN_PROJECTION_DATABASE_URL;
  if (typeof url !== 'string') {
    throw new Error('OPS_ADMIN_PROJECTION_DATABASE_URL is required');
  }
  return opsAdminProjectionDataSourceOptions(url);
}
