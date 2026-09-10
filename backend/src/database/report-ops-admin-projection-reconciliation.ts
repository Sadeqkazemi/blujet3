import 'dotenv/config';
import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { dataSourceOptions } from './data-source.options';
import { reconcileOpsAdminProjection } from '../modules/ops-admin/ops-admin-projection-reconciliation';

function databaseUrl(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error('Missing Ops/Admin reconciliation database URL');
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Ops/Admin reconciliation requires PostgreSQL');
  }
  return value;
}

function readOnlyOptions(url: string): DataSourceOptions {
  return {
    ...dataSourceOptions,
    url,
    entities: [],
    migrations: [],
    migrationsRun: false,
    synchronize: false,
    logging: false,
    extra: {
      max: 2,
      connectionTimeoutMillis: 2000,
      statement_timeout: 5000,
      options: '-c default_transaction_read_only=on -c timezone=UTC',
    },
  } as DataSourceOptions;
}

async function run(): Promise<void> {
  const rawLimit = process.argv[2] ?? '10000';
  if (!/^[1-9]\d{0,4}$/.test(rawLimit)) {
    throw new Error('Invalid Ops/Admin reconciliation limit');
  }
  const source = new DataSource(
    readOnlyOptions(
      databaseUrl('OPS_ADMIN_RECONCILIATION_SOURCE_DATABASE_URL'),
    ),
  );
  const projection = new DataSource(
    readOnlyOptions(
      databaseUrl('OPS_ADMIN_RECONCILIATION_TARGET_DATABASE_URL'),
    ),
  );
  try {
    await Promise.all([source.initialize(), projection.initialize()]);
    const report = await reconcileOpsAdminProjection(
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
    'Ops/Admin projection reconciliation unavailable; check restricted credentials and readiness.\n',
  );
  process.exitCode = 1;
});
