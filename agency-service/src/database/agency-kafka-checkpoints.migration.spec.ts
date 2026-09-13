import type { QueryRunner } from 'typeorm';
import { AgencyKafkaConsumerCheckpoints1793952000000 } from './migrations/1793952000000-AgencyKafkaConsumerCheckpoints';

function recordingQueryRunner(statements: string[]): QueryRunner {
  const query = jest.fn((statement: string): Promise<unknown[]> => {
    statements.push(statement);
    return Promise.resolve([]);
  });
  return { query } as unknown as QueryRunner;
}

describe('AgencyKafkaConsumerCheckpoints1793952000000', () => {
  const migration = new AgencyKafkaConsumerCheckpoints1793952000000();

  it('adds one Agency-owned table with bounded coordinates', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    expect(statements).toHaveLength(1);
    const sql = statements[0];
    expect(sql).toContain('CREATE TABLE "agency"."kafka_consumer_checkpoints"');
    expect(sql).toContain(
      'PRIMARY KEY ("consumerGroup", "topic", "partition")',
    );
    expect(sql).toContain('"partition" >= 0');
    expect(sql).toContain('"nextOffset" >= 0');
    expect(sql).toContain('"highWatermark" IS NULL OR "highWatermark" >= 0');
    expect(sql).not.toContain('FOREIGN KEY');
    expect(sql).not.toContain('ALTER TABLE');
  });

  it('removes only the checkpoint table on rollback', async () => {
    const statements: string[] = [];

    await migration.down(recordingQueryRunner(statements));

    expect(statements).toEqual([
      'DROP TABLE "agency"."kafka_consumer_checkpoints"',
    ]);
  });
});
