import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  readCommerceOutboxStatus,
  type CommerceOutboxStatus,
} from '../modules/commerce-outbox/commerce-outbox-status';

async function run(): Promise<void> {
  const flag = process.env.KAFKA_EVENTS_ENABLED;
  if (flag !== undefined && flag !== 'true' && flag !== 'false')
    throw new Error('Invalid dispatch flag');
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('PostgreSQL required');
  // No application startup, broker connection, entity discovery or migration.
  const db = new DataSource({
    type: 'postgres',
    url: url.toString(),
    synchronize: false,
    migrationsRun: false,
    logging: false,
    extra: {
      max: 1,
      connectionTimeoutMillis: 2000,
      statement_timeout: 2000,
      options: '-c default_transaction_read_only=on -c timezone=UTC',
    },
  });
  let report: CommerceOutboxStatus;
  try {
    await db.initialize();
    report = await readCommerceOutboxStatus(db, flag === 'true');
  } finally {
    if (db.isInitialized) await db.destroy();
  }
  process.stdout.write(JSON.stringify(report) + '\n');
  if (report.status === 'ATTENTION' || report.status === 'PAUSED')
    process.exitCode = 2;
}

void run().catch(() => {
  process.stdout.write(
    JSON.stringify({ reportVersion: 1, status: 'UNAVAILABLE' }) + '\n',
  );
  process.exitCode = 1;
});
