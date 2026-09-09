import {
  ORDER_BOOKING_ORDER_COLUMNS,
  ORDER_BOOKING_READER_RELATIONS,
  ORDER_BOOKING_READER_ROLE,
  provisionOrderBookingReaderRole,
  validateOrderBookingReaderPassword,
} from './provision-order-booking-reader-role';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

describe('Order/Booking reader role provisioner', () => {
  it('rejects weak credentials', () => {
    expect(() => validateOrderBookingReaderPassword('short')).toThrow(
      'ORDER_BOOKING_DATABASE_PASSWORD',
    );
    expect(() =>
      validateOrderBookingReaderPassword('x'.repeat(32)),
    ).not.toThrow();
  });

  it('grants only the PII-free Order projection relations', async () => {
    const statements: string[] = [];
    const client: RuntimeRoleSqlClient = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        if (statement.startsWith('SELECT format')) {
          return Promise.resolve({
            rows: [
              {
                statement: `ALTER ROLE ${ORDER_BOOKING_READER_ROLE} PASSWORD '<redacted>'`,
              },
            ],
          });
        }
        if (statement === 'SELECT current_database() AS database') {
          return Promise.resolve({ rows: [{ database: 'blujet' }] });
        }
        if (statement.includes('AS "restrictedReadOnly"')) {
          return Promise.resolve({
            rows: [
              {
                restrictedReadOnly: true,
                noMemberships: true,
                noOwnership: true,
                exactReads: true,
                exactOrderColumns: true,
                noWrites: true,
                noSequences: true,
                noDdl: true,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };
    await expect(
      provisionOrderBookingReaderRole(
        client,
        'order_booking_reader_password_2026_09_09',
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: ORDER_BOOKING_READER_ROLE,
      relationCount: ORDER_BOOKING_READER_RELATIONS.length,
    });
    const sql = statements.join('\n');
    expect(sql).toContain('GRANT SELECT ("id", "pnr", "channel"');
    expect(sql).toContain('ON TABLE "orders"."core_itinerary_orders"');
    expect(sql).not.toContain('GRANT SELECT ("contactPhone"');
    expect(ORDER_BOOKING_ORDER_COLUMNS).not.toContain('contactPhone');
    expect(ORDER_BOOKING_ORDER_COLUMNS).not.toContain('idempotencyRequestHash');
    expect(sql).toContain(
      'GRANT SELECT ON TABLE "orders"."core_itinerary_traveller_segments"',
    );
    expect(sql).not.toContain(
      'GRANT SELECT ON TABLE "orders"."core_itinerary_travellers"',
    );
    expect(sql).not.toContain('GRANT USAGE ON SCHEMA "payments"');
    expect(sql).toContain('FROM pg_sequence s');
    expect(statements.at(-1)).toBe('COMMIT');
  });
});
