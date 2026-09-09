import type { DataSourceOptions } from 'typeorm';
import { dataSourceOptions } from '../database/data-source.options';

const ROLE = 'blujet_ops_admin_reader';
const PORT_PATTERN = /^\d{1,5}$/;

export function validateOpsAdminWorkerEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  if (!['development', 'test', 'production'].includes(String(env.NODE_ENV))) {
    throw new Error('NODE_ENV must be test, development or production');
  }
  const url = env.OPS_ADMIN_DATABASE_URL;
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('OPS_ADMIN_DATABASE_URL is required');
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('OPS_ADMIN_DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    decodeURIComponent(parsed.username) !== ROLE
  ) {
    throw new Error(`OPS_ADMIN_DATABASE_URL must authenticate as ${ROLE}`);
  }
  const token = env.OPS_ADMIN_INTERNAL_TOKEN;
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error(
      'OPS_ADMIN_INTERNAL_TOKEN must contain at least 32 characters',
    );
  }
  const port = env.PORT ?? '3660';
  if (
    typeof port !== 'string' ||
    !PORT_PATTERN.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65_535
  ) {
    throw new Error('PORT must be between 1 and 65535');
  }
  return env;
}

export function opsAdminWorkerDataSourceOptions(
  env: Record<string, unknown> = process.env,
): DataSourceOptions {
  const url = env.OPS_ADMIN_DATABASE_URL;
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('OPS_ADMIN_DATABASE_URL is required');
  }
  return {
    ...dataSourceOptions,
    url,
    entities: [],
    migrations: [],
    synchronize: false,
    logging: false,
  } as DataSourceOptions;
}
