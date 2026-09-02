import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source.options';

const RESET_FLAG = '--execute-reset';
const CONFIRMATION = 'RESET_BLUJET_APPLICATION_DATA';

const knownSeedUsernames = [
  'com.ahmadi',
  'itadmin',
  'comm',
  'finance',
  'senior',
  'ceo',
  'chair',
  'site.admin',
  'sales.moradi',
  'emp.none',
  'fin.hosseini',
];

const knownSeedPhones = [
  '+989120000001',
  '+989120000002',
  '+989120000003',
  '09180000091',
  '09180000092',
  '09180000093',
];

type CountRow = { count: string };

async function fingerprintCounts(dataSource: DataSource) {
  const [users] = await dataSource.query<CountRow[]>(
    'SELECT COUNT(*)::text AS count FROM "users" WHERE "username" = ANY($1) OR "phone" = ANY($2)',
    [knownSeedUsernames, knownSeedPhones],
  );
  const [flights] = await dataSource.query<CountRow[]>(
    'SELECT COUNT(*)::text AS count FROM "flights" WHERE "flightNo" = ANY($1)',
    [['EP-821', 'BJ-100']],
  );
  const [bookings] = await dataSource.query<CountRow[]>(
    `SELECT COUNT(*)::text AS count FROM "bookings"
     WHERE "pnr" LIKE 'BJDEMO%' OR "pnr" LIKE 'BJAG%'
        OR "pnr" LIKE 'RFSEED%'`,
  );
  return {
    knownSeedUsers: Number(users?.count ?? 0),
    knownSeedFlights: Number(flights?.count ?? 0),
    knownSeedBookings: Number(bookings?.count ?? 0),
  };
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function main() {
  const execute = process.argv.includes(RESET_FLAG);
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  try {
    const fingerprints = await fingerprintCounts(dataSource);
    const populatedTables: { table: string; rows: number }[] = [];

    for (const metadata of dataSource.entityMetadatas) {
      const rows = await dataSource.getRepository(metadata.target).count();
      if (rows > 0) populatedTables.push({ table: metadata.tableName, rows });
    }

    console.log(
      JSON.stringify(
        {
          mode: execute ? 'RESET_REQUESTED' : 'DRY_RUN',
          database: new URL(process.env.DATABASE_URL ?? '').pathname.slice(1),
          fingerprints,
          populatedTables,
        },
        null,
        2,
      ),
    );

    if (!execute) {
      console.log(
        `Dry run only. To clear every application table, use ${RESET_FLAG} with the required production safeguards.`,
      );
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      throw new Error('Reset refused: NODE_ENV must equal production.');
    }
    if (process.env.PRODUCTION_RESET_CONFIRM !== CONFIRMATION) {
      throw new Error(
        `Reset refused: PRODUCTION_RESET_CONFIRM must equal ${CONFIRMATION}.`,
      );
    }
    if (!process.env.PRODUCTION_RESET_BACKUP_REF?.trim()) {
      throw new Error(
        'Reset refused: PRODUCTION_RESET_BACKUP_REF must identify a verified backup.',
      );
    }

    const tables = [
      ...new Set(dataSource.entityMetadatas.map((m) => m.tableName)),
    ]
      .sort()
      .map(quoteIdentifier)
      .join(', ');
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }

    console.log(
      `Application data reset completed. Backup reference: ${process.env.PRODUCTION_RESET_BACKUP_REF}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
