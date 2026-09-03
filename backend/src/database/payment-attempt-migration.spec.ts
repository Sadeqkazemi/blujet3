import type { QueryRunner } from 'typeorm';
import { PaymentAttempts1790697600000 } from './migrations/1790697600000-PaymentAttempts';

describe('payment attempt expansion migration', () => {
  it('adds only the attempt table and nullable completed-request fingerprint', async () => {
    const query = jest.fn<Promise<unknown>, [string]>().mockResolvedValue([]);
    await new PaymentAttempts1790697600000().up({
      query,
    } as unknown as QueryRunner);
    const sql = query.mock.calls.map(([statement]) => statement);
    expect(sql).toHaveLength(7);
    expect(
      sql.every((statement) => /^(CREATE|ALTER TABLE .* ADD)/.test(statement)),
    ).toBe(true);
    expect(sql.join('\n')).not.toMatch(
      /\bDROP\b|^\s*(DELETE|TRUNCATE|UPDATE)\b/m,
    );
    expect(sql).toContain(
      'ALTER TABLE "payments"."pay_idempotency_records" ADD "requestHash" text',
    );
    expect(sql.join('\n')).toContain('WHERE "status" <> \'FAILED\'');
    expect(sql.join('\n')).toContain(
      'REFERENCES "orders"."bookings"("id") ON DELETE RESTRICT',
    );
  });
});
