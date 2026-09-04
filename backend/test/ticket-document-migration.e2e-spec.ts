import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { AccountableTicketDocuments1790870400000 } from '../src/database/migrations/1790870400000-AccountableTicketDocuments';
import { CoreItineraryPaymentFulfilment1791302400000 } from '../src/database/migrations/1791302400000-CoreItineraryPaymentFulfilment';
import { CoreItineraryFullRefund1791388800000 } from '../src/database/migrations/1791388800000-CoreItineraryFullRefund';

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
      const fulfilmentMigration =
        new CoreItineraryPaymentFulfilment1791302400000();
      const refundMigration = new CoreItineraryFullRefund1791388800000();

      // Rehearse the older migration inside the current schema by first
      // removing, then restoring, the newer tables that depend on its stock.
      await refundMigration.down(runner);
      await fulfilmentMigration.down(runner);
      await migration.down(runner);
      await migration.up(runner);
      await fulfilmentMigration.up(runner);
      await refundMigration.up(runner);

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
