import type { DataSourceOptions } from 'typeorm';
import { dataSourceOptions } from '../database/data-source.options';

const PORT_PATTERN = /^\d{1,5}$/;
const INVENTORY_READER_ROLE = 'blujet_inventory_reader';

export function validateInventoryWorkerEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  if (!['development', 'test', 'production'].includes(String(env.NODE_ENV))) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  const url = env.INVENTORY_DATABASE_URL;
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('INVENTORY_DATABASE_URL is required');
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(url);
  } catch {
    throw new Error('INVENTORY_DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    decodeURIComponent(databaseUrl.username) !== INVENTORY_READER_ROLE
  ) {
    throw new Error(
      `INVENTORY_DATABASE_URL must authenticate as ${INVENTORY_READER_ROLE}`,
    );
  }
  const token = env.INVENTORY_INTERNAL_TOKEN;
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error(
      'INVENTORY_INTERNAL_TOKEN must contain at least 32 characters',
    );
  }
  const port = env.PORT ?? '3650';
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

export function inventoryWorkerDataSourceOptions(
  env: Record<string, unknown> = process.env,
): DataSourceOptions {
  const url = env.INVENTORY_DATABASE_URL;
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('INVENTORY_DATABASE_URL is required');
  }
  return {
    ...dataSourceOptions,
    url,
    synchronize: false,
    migrations: [],
    logging: false,
  } as DataSourceOptions;
}
