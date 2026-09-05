import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseOptions } from './config';
import { verifyReader } from './reader-verification';

async function run(): Promise<void> {
  const raw = process.env.LOYALTY_DATABASE_URL;
  if (!raw || !['postgres:', 'postgresql:'].includes(new URL(raw).protocol)) {
    throw new Error('Invalid reader database configuration');
  }
  const db = new DataSource(databaseOptions(raw));
  try {
    await db.initialize();
    const report = await verifyReader(
      db,
      process.env.LOYALTY_MEMBERSHIP_PROJECTION_ENABLED === 'true',
    );
    process.stdout.write(JSON.stringify(report) + '\n');
    if (report.status !== 'PASS') process.exitCode = 2;
  } finally {
    if (db.isInitialized) await db.destroy();
  }
}
void run().catch(() => {
  // Never print driver errors, SQL, URLs or role credentials.
  process.stdout.write(JSON.stringify({ status: 'UNAVAILABLE' }) + '\n');
  process.exitCode = 1;
});
