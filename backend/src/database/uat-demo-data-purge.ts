import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source.options';
import {
  operationalTables,
  UAT_PRESERVED_TABLES,
  UAT_PURGE_CONFIRMATION,
  UAT_PURGE_FLAG,
} from './uat-demo-data-purge-policy';

type CountRow = { count: string };

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function tableCounts(dataSource: DataSource, tables: string[]) {
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const [row] = await dataSource.query<CountRow[]>(
      `SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(table)}`,
    );
    counts[table] = Number(row?.count ?? 0);
  }
  return counts;
}

async function main() {
  const execute = process.argv.includes(UAT_PURGE_FLAG);
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  try {
    const entityTables = dataSource.entityMetadatas.map((m) => m.tableName);
    const purgeTables = operationalTables(entityTables);
    const preservedTables = entityTables
      .filter((table) => UAT_PRESERVED_TABLES.has(table))
      .sort();
    const [usersToDelete] = await dataSource.query<CountRow[]>(
      `SELECT COUNT(*)::text AS count
       FROM "users"
       WHERE NOT (
         "isSuperAdmin" = true
         OR LOWER(COALESCE("username", '')) LIKE 'uat.%'
         OR LOWER(COALESCE("username", '')) LIKE 'panel.%'
       )`,
    );

    console.log(
      JSON.stringify(
        {
          mode: execute ? 'UAT_PURGE_REQUESTED' : 'DRY_RUN',
          database: new URL(process.env.DATABASE_URL ?? '').pathname.slice(1),
          usersToDelete: Number(usersToDelete?.count ?? 0),
          purgeTableCounts: await tableCounts(dataSource, purgeTables),
          preservedTableCounts: await tableCounts(dataSource, preservedTables),
          preservedUserRule: [
            'isSuperAdmin=true',
            'username=uat.*',
            'username=panel.*',
          ],
        },
        null,
        2,
      ),
    );

    if (!execute) {
      console.log(
        `Dry run only. Use ${UAT_PURGE_FLAG} with every required UAT safeguard to execute.`,
      );
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      throw new Error('UAT purge refused: NODE_ENV must equal production.');
    }
    if (process.env.AUTH_SANDBOX_ENABLED !== 'true') {
      throw new Error(
        'UAT purge refused: AUTH_SANDBOX_ENABLED must equal true.',
      );
    }
    if (process.env.UAT_DEMO_PURGE_CONFIRM !== UAT_PURGE_CONFIRMATION) {
      throw new Error(
        `UAT purge refused: UAT_DEMO_PURGE_CONFIRM must equal ${UAT_PURGE_CONFIRMATION}.`,
      );
    }
    if (!process.env.UAT_DEMO_PURGE_BACKUP_REF?.trim()) {
      throw new Error(
        'UAT purge refused: UAT_DEMO_PURGE_BACKUP_REF must identify a verified backup.',
      );
    }

    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      if (purgeTables.length > 0) {
        const quotedTables = purgeTables.map(quoteIdentifier).join(', ');
        await runner.query(
          `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`,
        );
      }
      await runner.query(
        `DELETE FROM "users"
         WHERE NOT (
           "isSuperAdmin" = true
           OR LOWER(COALESCE("username", '')) LIKE 'uat.%'
           OR LOWER(COALESCE("username", '')) LIKE 'panel.%'
         )`,
      );
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }

    console.log(
      `UAT demo data purge completed. Backup reference: ${process.env.UAT_DEMO_PURGE_BACKUP_REF}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
