import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import dataSource from './data-source';
import { HttpPssClient } from '../modules/pss/http-pss.client';

async function count(sql: string, parameters: unknown[] = []): Promise<number> {
  const rows: unknown = await dataSource.query(sql, parameters);
  if (!Array.isArray(rows)) return 0;
  const first: unknown = rows[0];
  if (typeof first !== 'object' || first === null || !('count' in first)) {
    return 0;
  }
  return Number(first.count ?? 0);
}

async function run(): Promise<void> {
  await dataSource.initialize();
  try {
    const client = new HttpPssClient(new ConfigService(process.env));
    const snapshot = {
      capturedAt: new Date().toISOString(),
      website: {
        orders: await count(
          'SELECT count(*) FROM bookings WHERE "deletedAt" IS NULL',
        ),
        travellers: await count(
          'SELECT count(*) FROM passengers p JOIN bookings b ON b.id = p."bookingId" WHERE b."deletedAt" IS NULL',
        ),
        heldOrders: await count(
          'SELECT count(*) FROM bookings WHERE "deletedAt" IS NULL AND status = $1',
          ['HELD'],
        ),
        ticketedOrders: await count(
          'SELECT count(*) FROM bookings WHERE "deletedAt" IS NULL AND status = $1',
          ['TICKETED'],
        ),
        // The legacy website has no immutable inventory-transaction table.
        // Explicit zero keeps cutoverReady false once PSS has transactions.
        inventoryTransactions: 0,
      },
    };
    const report = await client.reconcileShadow(snapshot);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.cutoverReady) process.exitCode = 2;
  } finally {
    await dataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`PSS shadow reconciliation failed: ${message}\n`);
  process.exitCode = 1;
});
