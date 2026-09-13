import type { QueryRunner } from 'typeorm';
import { LoyaltyKafkaFailureQuarantine1793689200000 } from './migrations/1793689200000-LoyaltyKafkaFailureQuarantine';

function recordingQueryRunner(statements: string[]): QueryRunner {
  const query = jest.fn((statement: string): Promise<unknown[]> => {
    statements.push(statement);
    return Promise.resolve([]);
  });
  return { query } as unknown as QueryRunner;
}

describe('LoyaltyKafkaFailureQuarantine1793689200000', () => {
  const migration = new LoyaltyKafkaFailureQuarantine1793689200000();

  it('adds one bounded metadata-only Loyalty table', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    expect(sql.match(/CREATE TABLE /g) ?? []).toHaveLength(1);
    expect(sql).toContain('CREATE TABLE "loyalty"."kafka_processing_failures"');
    expect(sql).toContain('("consumerGroup", "topic", "partition", "offset")');
    expect(sql).toContain('"attempts" >= 0 AND "attempts" <= 10');
    expect(sql).toContain("'TRANSPORT', 'PROJECTION'");
    expect(sql).toContain("'QUARANTINED'");
    expect(sql).not.toContain('payload');
    expect(sql).not.toContain('headers');
    expect(sql).not.toContain('FOREIGN KEY');
    expect(sql).not.toContain('ALTER TABLE');
  });

  it('removes only the failure registry on rollback', async () => {
    const statements: string[] = [];

    await migration.down(recordingQueryRunner(statements));

    expect(statements).toEqual([
      'DROP TABLE "loyalty"."kafka_processing_failures"',
    ]);
  });
});
