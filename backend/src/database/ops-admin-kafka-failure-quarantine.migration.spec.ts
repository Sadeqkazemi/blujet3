import type { QueryRunner } from 'typeorm';
import { OpsAdminKafkaFailureQuarantine1794124800000 } from './ops-admin-migrations/1794124800000-OpsAdminKafkaFailureQuarantine';

function recordingQueryRunner(statements: string[]): QueryRunner {
  const query = jest.fn((statement: string): Promise<unknown[]> => {
    statements.push(statement);
    return Promise.resolve([]);
  });
  return { query } as unknown as QueryRunner;
}

describe('OpsAdminKafkaFailureQuarantine1794124800000', () => {
  const migration = new OpsAdminKafkaFailureQuarantine1794124800000();

  it('adds one bounded metadata-only Ops/Admin table', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    expect(sql.match(/CREATE TABLE /g) ?? []).toHaveLength(1);
    expect(sql).toContain('CREATE TABLE "ops"."kafka_processing_failures"');
    expect(sql).toContain('("consumerGroup", "topic", "partition", "offset")');
    expect(sql).toContain('"attempts" >= 0 AND "attempts" <= 10');
    expect(sql).toContain('"approvalReason" character varying(64)');
    expect(sql).toContain('ops_admin_kafka_failure_approval_reason_check');
    expect(sql).toContain("'MESSAGE_REJECTED_AFTER_REVIEW'");
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
      'DROP TABLE "ops"."kafka_processing_failures"',
    ]);
  });
});
