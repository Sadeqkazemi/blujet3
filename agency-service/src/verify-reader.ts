import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseOptions } from './config';
import { verifyReader, type ReaderReport } from './reader-verification';

async function run(): Promise<void> {
  const raw = process.env.AGENCY_DATABASE_URL;
  if (!raw || !['postgres:', 'postgresql:'].includes(new URL(raw).protocol)) {
    throw new Error('Invalid reader database configuration');
  }
  const db = new DataSource(databaseOptions(raw));
  let report: ReaderReport;
  try {
    await db.initialize();
    report = await verifyReader(db);
  } finally {
    if (db.isInitialized) await db.destroy();
  }
  // Publish only after cleanup succeeds, so failure never emits a second report.
  process.stdout.write(JSON.stringify(report) + '\n');
  if (report.status !== 'PASS') process.exitCode = 2;
}
void run().catch(() => {
  // Never print driver errors, SQL, URLs or role credentials.
  process.stdout.write(JSON.stringify({ status: 'UNAVAILABLE' }) + '\n');
  process.exitCode = 1;
});
