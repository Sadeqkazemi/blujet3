import type { QueryRunner } from 'typeorm';
import { OpsAdminKafkaConsumerCheckpoints1794038400000 } from './ops-admin-migrations/1794038400000-OpsAdminKafkaConsumerCheckpoints';

describe('OpsAdminKafkaConsumerCheckpoints1794038400000', () => {
  const migration = new OpsAdminKafkaConsumerCheckpoints1794038400000();

  function runner() {
    const query = jest.fn<Promise<unknown>, [string]>().mockResolvedValue([]);
    return { query } as unknown as QueryRunner & {
      query: jest.Mock<Promise<unknown>, [string]>;
    };
  }

  it('creates only the content-free checkpoint relation with bounded keys', async () => {
    const queryRunner = runner();

    await migration.up(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledTimes(1);
    const sql = queryRunner.query.mock.calls[0][0];
    expect(sql).toContain('"ops"."kafka_consumer_checkpoints"');
    expect(sql).toContain(
      'PRIMARY KEY ("consumerGroup", "topic", "partition")',
    );
    expect(sql).toContain('CHECK ("partition" >= 0)');
    expect(sql).toContain('CHECK ("nextOffset" >= 0)');
    expect(sql).toContain('"highWatermark" bigint');
    expect(sql).not.toMatch(/payload|eventId|taskId|credential/i);
  });

  it('rolls back only its additive relation', async () => {
    const queryRunner = runner();

    await migration.down(queryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS "ops"."kafka_consumer_checkpoints"',
    );
  });
});
