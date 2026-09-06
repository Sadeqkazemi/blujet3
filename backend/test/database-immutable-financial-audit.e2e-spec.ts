import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { ImmutableFinancialAuditRows1791900000000 } from '../src/database/migrations/1791900000000-ImmutableFinancialAuditRows';

type ProtectedTable = {
  schema: string;
  table: string;
  insertSql: string;
  params: (ids: {
    userId: string;
    clubMemberId: string;
    actorRole: string;
  }) => unknown[];
};

describe('database append-only financial and audit rows', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await new DataSource(dataSourceOptions).initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('installs the guard trigger on every protected table', async () => {
    const rows = await dataSource.query<
      Array<{ table_schema: string; table_name: string }>
    >(
      `SELECT n.nspname AS table_schema, c.relname AS table_name
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE NOT t.tgisinternal AND t.tgname LIKE '%_append_only_guard'
       ORDER BY n.nspname, c.relname`,
    );

    expect(rows).toEqual([
      { table_schema: 'audit', table_name: 'audit_logs' },
      { table_schema: 'loyalty', table_name: 'club_points_entries' },
      { table_schema: 'payments', table_name: 'bank_loan_webhook_events' },
      { table_schema: 'payments', table_name: 'ledger_entries' },
      { table_schema: 'payments', table_name: 'wallet_entries' },
    ]);
  });

  it.each(['UPDATE', 'DELETE'])(
    'allows an insert but rejects % on every protected table',
    async (operation) => {
      const [{ id: userId, role: actorRole }] = await dataSource.query<
        Array<{ id: string; role: string }>
      >('SELECT "id", "role" FROM identity.users ORDER BY "createdAt" LIMIT 1');
      const [{ id: clubMemberId }] = await dataSource.query<
        Array<{ id: string }>
      >('SELECT "id" FROM loyalty.club_members ORDER BY "createdAt" LIMIT 1');

      const tables: ProtectedTable[] = [
        {
          schema: 'payments',
          table: 'ledger_entries',
          insertSql:
            'INSERT INTO payments.ledger_entries ("id", "type", "signedAmountIrr") VALUES ($1, \'SALE\', 1)',
          params: () => [randomUUID()],
        },
        {
          schema: 'payments',
          table: 'wallet_entries',
          insertSql:
            'INSERT INTO payments.wallet_entries ("id", "userId", "type", "signedAmountIrr") VALUES ($1, $2, \'ADJUST\', 1)',
          params: () => [randomUUID(), userId],
        },
        {
          schema: 'payments',
          table: 'bank_loan_webhook_events',
          insertSql:
            'INSERT INTO payments.bank_loan_webhook_events ("id", "provider", "eventId") VALUES ($1, \'test\', $2)',
          params: () => [randomUUID(), randomUUID()],
        },
        {
          schema: 'loyalty',
          table: 'club_points_entries',
          insertSql:
            'INSERT INTO loyalty.club_points_entries ("id", "clubMemberId", "type", "signedPoints") VALUES ($1, $2, \'ADJUST\', 1)',
          params: () => [randomUUID(), clubMemberId],
        },
        {
          schema: 'audit',
          table: 'audit_logs',
          insertSql:
            'INSERT INTO audit.audit_logs ("id", "actorId", "actorRole", "category", "action", "detail") VALUES ($1, $2, $3, \'SYSTEM\', \'append-only-test\', \'transaction is rolled back\')',
          params: () => [randomUUID(), userId, actorRole],
        },
      ];

      for (const definition of tables) {
        const runner = dataSource.createQueryRunner();
        await runner.connect();
        await runner.startTransaction();
        try {
          const params = definition.params({ userId, clubMemberId, actorRole });
          const [id] = params;
          await runner.query(definition.insertSql, params);
          const mutation =
            operation === 'UPDATE'
              ? `UPDATE ${definition.schema}.${definition.table} SET "id" = "id" WHERE "id" = $1`
              : `DELETE FROM ${definition.schema}.${definition.table} WHERE "id" = $1`;
          await expect(runner.query(mutation, [id])).rejects.toMatchObject({
            code: '55000',
          });
        } finally {
          await runner.rollbackTransaction();
          await runner.release();
        }
      }
    },
  );

  it('can reverse and reapply the migration inside a transaction', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new ImmutableFinancialAuditRows1791900000000();
      await migration.down(runner);
      await migration.up(runner);
      const [{ count }] = await runner.query<Array<{ count: string }>>(
        `SELECT count(*)::text AS count
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgname LIKE '%_append_only_guard'`,
      );
      expect(count).toBe('5');
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
