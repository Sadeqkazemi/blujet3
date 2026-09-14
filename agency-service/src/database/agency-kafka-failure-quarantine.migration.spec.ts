import type { QueryRunner } from 'typeorm';
import { AgencyKafkaFailureQuarantine1794038400000 } from './migrations/1794038400000-AgencyKafkaFailureQuarantine';

function recordingQueryRunner(statements: string[]): QueryRunner {
  const query = jest.fn((statement: string): Promise<unknown[]> => {
    statements.push(statement);
    return Promise.resolve([]);
  });
  return { query } as unknown as QueryRunner;
}

describe('AgencyKafkaFailureQuarantine1794038400000', () => {
  const migration = new AgencyKafkaFailureQuarantine1794038400000();

  it('adds one bounded metadata-only Agency table', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    expect(sql.match(/CREATE TABLE /g) ?? []).toHaveLength(1);
    expect(sql).toContain('CREATE TABLE "agency"."kafka_processing_failures"');
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
      'DROP TABLE "agency"."kafka_processing_failures"',
    ]);
  });
});
