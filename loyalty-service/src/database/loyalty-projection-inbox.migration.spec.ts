import type { QueryRunner } from 'typeorm';
import { LoyaltyProjectionInbox1793516400000 } from './migrations/1793516400000-LoyaltyProjectionInbox';

function recordingQueryRunner(statements: string[]): QueryRunner {
  const query = jest.fn((statement: string): Promise<unknown[]> => {
    statements.push(statement);
    return Promise.resolve([]);
  });
  return { query } as unknown as QueryRunner;
}

describe('LoyaltyProjectionInbox1793516400000', () => {
  const migration = new LoyaltyProjectionInbox1793516400000();

  it('adds only receipt and aggregate-slot control tables', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    expect(sql.match(/CREATE TABLE /g) ?? []).toHaveLength(2);
    expect(sql).toContain(
      'CREATE TABLE "loyalty"."loyalty_projection_event_receipts"',
    );
    expect(sql).toContain('CREATE TABLE "loyalty"."loyalty_projection_slots"');
    expect(sql).toContain('"loyalty_projection_event_receipts_pkey"');
    expect(sql).toContain('PRIMARY KEY ("aggregateType", "aggregateId")');
    expect(sql).toContain('"loyalty_projection_receipt_aggregate_type_check"');
    expect(sql).toContain('"loyalty_projection_slot_aggregate_type_check"');
    expect(sql.match(/'LoyaltyReferral'/g) ?? []).toHaveLength(2);
    expect(sql).toContain(
      '"loyalty_projection_event_receipts_immutable_guard"',
    );
    expect(sql).not.toContain('ALTER TABLE');
    expect(sql).not.toContain('FOREIGN KEY');
  });

  it('removes only projection control tables on rollback', async () => {
    const statements: string[] = [];

    await migration.down(recordingQueryRunner(statements));

    expect(statements).toEqual([
      'DROP TABLE "loyalty"."loyalty_projection_slots"',
      'DROP TRIGGER "loyalty_projection_event_receipts_immutable_guard" ON "loyalty"."loyalty_projection_event_receipts"',
      'DROP FUNCTION "loyalty"."reject_loyalty_projection_receipt_mutation"()',
      'DROP TABLE "loyalty"."loyalty_projection_event_receipts"',
    ]);
  });
});
