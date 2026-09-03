import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { Booking } from '../src/database/entities/booking.entity';
import { BookingReplayFingerprint1790611200000 } from '../src/database/migrations/1790611200000-BookingReplayFingerprint';

describe('booking replay migration', () => {
  let ds: DataSource;
  beforeAll(async () => {
    ds = await new DataSource(dataSourceOptions).initialize();
  });
  afterAll(async () => {
    await ds.destroy();
  });

  it('hides the fingerprint from ordinary entity reads', async () => {
    const booking = await ds.getRepository(Booking).findOneByOrFail({});
    expect(booking.idempotencyRequestHash).toBeUndefined();
    expect(
      ds
        .getMetadata(Booking)
        .findColumnWithPropertyName('idempotencyRequestHash')?.isSelect,
    ).toBe(false);
  });

  it('can reverse and expand without touching booking rows, restoring metadata by rollback', async () => {
    // DDL is exercised only inside a rolled-back transaction on the test DB.
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const before = await runner.query<Array<{ count: string }>>(
        'SELECT count(*)::text AS count FROM orders.bookings',
      );
      const migration = new BookingReplayFingerprint1790611200000();
      await migration.down(runner);
      const missing = await runner.query<Array<{ column_name: string }>>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'orders' AND table_name = 'bookings' AND column_name = 'idempotencyRequestHash'`,
      );
      expect(missing).toHaveLength(0);
      await migration.up(runner);
      const column = await runner.query<
        Array<{ is_nullable: string; data_type: string }>
      >(
        `SELECT is_nullable, data_type FROM information_schema.columns WHERE table_schema = 'orders' AND table_name = 'bookings' AND column_name = 'idempotencyRequestHash'`,
      );
      expect(column).toEqual([{ is_nullable: 'YES', data_type: 'text' }]);
      expect(
        await runner.query(
          'SELECT count(*)::text AS count FROM orders.bookings',
        ),
      ).toEqual(before);
      const fingerprints = await runner.query<Array<{ count: string }>>(
        'SELECT count(*)::text AS count FROM orders.bookings WHERE "idempotencyRequestHash" IS NOT NULL',
      );
      expect(fingerprints).toEqual([{ count: '0' }]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
