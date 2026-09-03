import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { AccountableTicketDocuments1790870400000 } from '../src/database/migrations/1790870400000-AccountableTicketDocuments';

describe('accountable ticket-document migration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await new DataSource(dataSourceOptions).initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('rebuilds the additive tables and classifies every legacy number as quarantined', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new AccountableTicketDocuments1790870400000();
      await migration.down(runner);
      await migration.up(runner);

      const counts = await runner.query<
        Array<{ legacy_count: string; quarantined_count: string }>
      >(`
        SELECT
          (SELECT count(*)::text FROM orders.passengers WHERE "ticketNo" IS NOT NULL) AS legacy_count,
          (SELECT count(*)::text FROM orders.ticket_documents WHERE "accountabilityStatus" = 'QUARANTINED') AS quarantined_count
      `);
      expect(counts[0]?.quarantined_count).toBe(counts[0]?.legacy_count);
      expect(
        await runner.query(`
          SELECT count(*)::text AS count
          FROM orders.ticket_documents
          WHERE "accountabilityStatus" = 'ACCOUNTABLE'
             OR "stockId" IS NOT NULL
        `),
      ).toEqual([{ count: '0' }]);
      expect(
        await runner.query(`
          SELECT count(*)::text AS count
          FROM orders.ticket_document_stocks
        `),
      ).toEqual([{ count: '0' }]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
