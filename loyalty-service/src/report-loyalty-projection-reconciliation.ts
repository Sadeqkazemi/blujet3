import 'dotenv/config';
import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { reconcileLoyaltyProjection } from './projection/loyalty-projection-reconciliation';

function databaseUrl(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error('Missing Loyalty reconciliation database URL');
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Loyalty reconciliation requires PostgreSQL');
  }
  return value;
}

function databaseIdentity(value: string): string {
  const url = new URL(value);
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}${url.pathname}`;
}

function readOnlyOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [],
    migrations: [],
    migrationsRun: false,
    synchronize: false,
    logging: false,
    extra: {
      max: 2,
      connectionTimeoutMillis: 2000,
      statement_timeout: 10000,
      options: '-c default_transaction_read_only=on -c timezone=UTC',
    },
  };
}

async function run(): Promise<void> {
  const rawLimit = process.argv[2] ?? '10000';
  if (!/^[1-9]\d{0,6}$/.test(rawLimit) || Number(rawLimit) > 1_000_000) {
    throw new Error('Invalid Loyalty reconciliation limit');
  }
  const sourceUrl = databaseUrl('LOYALTY_RECONCILIATION_SOURCE_DATABASE_URL');
  const projectionUrl = databaseUrl(
    'LOYALTY_RECONCILIATION_TARGET_DATABASE_URL',
  );
  if (databaseIdentity(sourceUrl) === databaseIdentity(projectionUrl)) {
    throw new Error('Loyalty reconciliation databases must differ');
  }
  const source = new DataSource(readOnlyOptions(sourceUrl));
  const projection = new DataSource(readOnlyOptions(projectionUrl));
  try {
    await Promise.all([source.initialize(), projection.initialize()]);
    const report = await reconcileLoyaltyProjection(
      source,
      projection,
      Number(rawLimit),
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (report.status !== 'MATCH') process.exitCode = 2;
  } finally {
    await Promise.all([
      source.isInitialized ? source.destroy() : Promise.resolve(),
      projection.isInitialized ? projection.destroy() : Promise.resolve(),
    ]);
  }
}

void run().catch(() => {
  process.stderr.write(
    'Loyalty projection reconciliation unavailable; check restricted credentials and readiness.\n',
  );
  process.exitCode = 1;
});
