import type { DataSourceOptions } from 'typeorm';
import { dataSourceOptions } from '../database/data-source.options';

const ROLE = 'blujet_ticketing_refund_reader';
const PORT_PATTERN = /^\d{1,5}$/;

export function validateTicketingRefundWorkerEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  if (!['development', 'test', 'production'].includes(String(env.NODE_ENV)))
    throw new Error('NODE_ENV must be development, test or production');
  const databaseUrl = env.TICKETING_REFUND_DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '')
    throw new Error('TICKETING_REFUND_DATABASE_URL is required');
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      'TICKETING_REFUND_DATABASE_URL must be a valid PostgreSQL URL',
    );
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    decodeURIComponent(parsed.username) !== ROLE
  )
    throw new Error(
      `TICKETING_REFUND_DATABASE_URL must authenticate as ${ROLE}`,
    );
  const token = env.TICKETING_REFUND_INTERNAL_TOKEN;
  if (typeof token !== 'string' || token.length < 32)
    throw new Error(
      'TICKETING_REFUND_INTERNAL_TOKEN must contain at least 32 characters',
    );
  const port = env.PORT ?? '3620';
  if (
    typeof port !== 'string' ||
    !PORT_PATTERN.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65_535
  )
    throw new Error('PORT must be between 1 and 65535');
  return env;
}

export function ticketingRefundWorkerDataSourceOptions(
  env: Record<string, unknown> = process.env,
): DataSourceOptions {
  const url = env.TICKETING_REFUND_DATABASE_URL;
  if (typeof url !== 'string' || url.trim() === '')
    throw new Error('TICKETING_REFUND_DATABASE_URL is required');
  return {
    ...dataSourceOptions,
    url,
    synchronize: false,
    migrations: [],
    logging: false,
  } as DataSourceOptions;
}
