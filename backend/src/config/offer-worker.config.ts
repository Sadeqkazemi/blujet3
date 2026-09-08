import type { DataSourceOptions } from 'typeorm';
import { dataSourceOptions } from '../database/data-source.options';

const PORT_PATTERN = /^\d{1,5}$/;
const OFFER_READER_ROLE = 'blujet_offer_reader';

export function validateOfferWorkerEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  if (!['development', 'test', 'production'].includes(String(env.NODE_ENV))) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  if (
    typeof env.OFFER_DATABASE_URL !== 'string' ||
    env.OFFER_DATABASE_URL.trim() === ''
  ) {
    throw new Error('OFFER_DATABASE_URL is required');
  }
  let offerDatabaseUrl: URL;
  try {
    offerDatabaseUrl = new URL(env.OFFER_DATABASE_URL);
  } catch {
    throw new Error('OFFER_DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (
    !['postgres:', 'postgresql:'].includes(offerDatabaseUrl.protocol) ||
    decodeURIComponent(offerDatabaseUrl.username) !== OFFER_READER_ROLE
  ) {
    throw new Error(
      `OFFER_DATABASE_URL must authenticate as ${OFFER_READER_ROLE}`,
    );
  }
  for (const key of [
    'OFFER_INTERNAL_TOKEN',
    'CORE_OFFER_SIGNING_SECRET',
  ] as const) {
    const value = env[key];
    if (typeof value !== 'string' || value.length < 32) {
      throw new Error(`${key} must contain at least 32 characters`);
    }
  }
  const ttl = Number(env.CORE_OFFER_TTL_SECONDS ?? '900');
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 900) {
    throw new Error('CORE_OFFER_TTL_SECONDS must be between 60 and 900');
  }
  const port = env.PORT ?? '3600';
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

export function offerWorkerDataSourceOptions(
  env: Record<string, unknown> = process.env,
): DataSourceOptions {
  const url = env.OFFER_DATABASE_URL;
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('OFFER_DATABASE_URL is required');
  }
  return {
    ...dataSourceOptions,
    url,
    synchronize: false,
    migrations: [],
    logging: false,
  } as DataSourceOptions;
}
