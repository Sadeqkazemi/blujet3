import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source.options';

const EXECUTE_FLAG = '--execute-cleanup';
const CONFIRMATION = 'CLEAR_BLUJET_UAT_FLIGHT_CATALOG';
const ROUTE_DELETION_CONFIRMATION = 'DELETE_BLUJET_UAT_ROUTES';

type CountRow = { count: string };

async function count(dataSource: DataSource, table: string): Promise<number> {
  const [row] = await dataSource.query<CountRow[]>(
    `SELECT COUNT(*)::text AS count FROM "${table}"`,
  );
  return Number(row?.count ?? 0);
}

async function main() {
  const execute = process.argv.includes(EXECUTE_FLAG);
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  try {
    const [airportCount, routeCount] = await Promise.all([
      count(dataSource, 'airports'),
      count(dataSource, 'routes'),
    ]);
    console.log(
      JSON.stringify(
        {
          mode: execute ? 'UAT_FLIGHT_CATALOG_CLEANUP_REQUESTED' : 'DRY_RUN',
          airportsToDelete: airportCount,
          routeCount,
        },
        null,
        2,
      ),
    );

    if (!execute) return;
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'UAT flight catalog cleanup refused: NODE_ENV must equal production.',
      );
    }
    if (process.env.AUTH_SANDBOX_ENABLED !== 'true') {
      throw new Error(
        'UAT flight catalog cleanup refused: AUTH_SANDBOX_ENABLED must equal true.',
      );
    }
    if (process.env.UAT_FLIGHT_CATALOG_CLEANUP_CONFIRM !== CONFIRMATION) {
      throw new Error(
        `UAT flight catalog cleanup refused: confirmation must equal ${CONFIRMATION}.`,
      );
    }
    if (!process.env.UAT_FLIGHT_CATALOG_CLEANUP_BACKUP_REF?.trim()) {
      throw new Error(
        'UAT flight catalog cleanup refused: a verified backup reference is required.',
      );
    }
    if (
      routeCount > 0 &&
      process.env.UAT_FLIGHT_CATALOG_DELETE_ROUTES_CONFIRM !==
        ROUTE_DELETION_CONFIRMATION
    ) {
      throw new Error(
        `UAT flight catalog cleanup refused: ${routeCount} real route(s) exist; route deletion confirmation must equal ${ROUTE_DELETION_CONFIRMATION}.`,
      );
    }

    await dataSource.transaction(async (manager) => {
      await manager.query(
        'TRUNCATE TABLE "routes", "airports" RESTART IDENTITY CASCADE',
      );
    });
    console.log(
      `UAT flight catalog cleanup completed. Backup reference: ${process.env.UAT_FLIGHT_CATALOG_CLEANUP_BACKUP_REF}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
