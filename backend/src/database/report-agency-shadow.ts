import 'dotenv/config';
import 'reflect-metadata';
import {
  compareAgencyShadow,
  shadowConfig,
  validateSample,
  type ShadowReport,
} from '../modules/agency-shadow/agency-shadow';

async function run(): Promise<void> {
  const config = shadowConfig(process.env);
  if (!config.enabled) {
    process.stdout.write(JSON.stringify({ status: 'DISABLED' }) + '\n');
    return;
  }
  const agencyId = process.argv[2] ?? '';
  const rawPage = process.argv[3] ?? '1';
  if (!/^[1-9]\d{0,3}$/.test(rawPage)) throw new Error('Invalid Agency page');
  const page = Number(rawPage);
  validateSample(agencyId, page);
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('PostgreSQL required');
  const { DataSource } = await import('typeorm');
  const { dataSourceOptions } = await import('./data-source.options.js');
  const { readLocalAgency } =
    await import('../modules/agency-shadow/local-agency-projection.js');
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
  let report: ShadowReport;
  try {
    await db.initialize();
    report = await compareAgencyShadow(
      config,
      agencyId,
      page,
      (owner, selectedPage) => readLocalAgency(db, owner, selectedPage),
    );
  } finally {
    if (db.isInitialized) await db.destroy();
  }
  process.stdout.write(JSON.stringify(report) + '\n');
  if (report.status !== 'MATCH') process.exitCode = 2;
}
void run().catch(() => {
  process.stdout.write(JSON.stringify({ status: 'UNAVAILABLE' }) + '\n');
  process.exitCode = 1;
});
