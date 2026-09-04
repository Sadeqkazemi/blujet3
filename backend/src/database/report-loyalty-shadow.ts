import 'dotenv/config';
import 'reflect-metadata';
import { isUUID } from 'class-validator';
import {
  compareLoyaltyShadow,
  shadowConfig,
} from '../modules/loyalty-shadow/loyalty-shadow';

async function run(): Promise<void> {
  const config = shadowConfig(process.env);
  // Do not initialize TypeORM (or connect anywhere) when the switch is off.
  if (!config.enabled) {
    process.stdout.write(JSON.stringify({ status: 'DISABLED' }) + '\n');
    return;
  }
  const userId = process.argv[2];
  if (!userId || !isUUID(userId))
    throw new Error('An explicit user UUID is required');
  const { DataSource } = await import('typeorm');
  const { dataSourceOptions } = await import('./data-source.options.js');
  const { readLocalLoyalty } =
    await import('../modules/loyalty-shadow/local-loyalty-projection.js');
  const db = new DataSource({
    ...dataSourceOptions,
    synchronize: false,
    migrationsRun: false,
    logging: false,
    extra: {
      max: 2,
      connectionTimeoutMillis: 2000,
      statement_timeout: 2000,
      options: '-c default_transaction_read_only=on -c timezone=UTC',
    },
  });
  await db.initialize();
  try {
    const report = await compareLoyaltyShadow(config, userId, (owner, at) =>
      readLocalLoyalty(db, owner, at),
    );
    process.stdout.write(JSON.stringify(report) + '\n');
    if (report.status !== 'MATCH') process.exitCode = 2;
  } finally {
    await db.destroy();
  }
}

void run().catch(() => {
  // Never print SQL, connection strings, owner identifiers or service secrets.
  process.stderr.write(
    'Loyalty shadow comparison unavailable; check configuration and readiness.\n',
  );
  process.exitCode = 1;
});
