import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EachMessagePayload } from 'kafkajs';
import { DataSource } from 'typeorm';
import { createCartableTaskProjectedEvent } from '../src/common/events/ops-admin-events';
import { OpsAdminCartableEventReceipt } from '../src/database/ops-admin-projection-entities/ops-admin-cartable-event-receipt.entity';
import { OpsAdminCartableTaskProjection } from '../src/database/ops-admin-projection-entities/ops-admin-cartable-task.entity';
import { OpsAdminKafkaConsumerCheckpoint } from '../src/database/ops-admin-projection-entities/ops-admin-kafka-consumer-checkpoint.entity';
import {
  OpsAdminKafkaFailureStage,
  OpsAdminKafkaFailureStatus,
  OpsAdminKafkaProcessingFailure,
} from '../src/database/ops-admin-projection-entities/ops-admin-kafka-processing-failure.entity';
import { opsAdminProjectionDataSourceOptions } from '../src/database/ops-admin-projection-data-source.options';
import { OpsAdminKafkaConsumerCheckpoints1794038400000 } from '../src/database/ops-admin-migrations/1794038400000-OpsAdminKafkaConsumerCheckpoints';
import { OpsAdminKafkaFailureQuarantine1794124800000 } from '../src/database/ops-admin-migrations/1794124800000-OpsAdminKafkaFailureQuarantine';
import {
  CartableCategory,
  CartableSourceType,
  CartableStatus,
} from '../src/database/enums';
import { OpsAdminKafkaHandler } from '../src/modules/ops-admin/ops-admin-kafka.handler';
import { OpsAdminDlqStore } from '../src/modules/ops-admin/ops-admin-dlq.store';
import { OpsAdminProjectionConsumer } from '../src/modules/ops-admin/ops-admin-projection.consumer';
import { OpsAdminProjectionStore } from '../src/modules/ops-admin/ops-admin-projection.store';
import { OpsAdminReadService } from '../src/modules/ops-admin/ops-admin-read.service';

describe('Ops/Admin ordered projection consumer (PostgreSQL)', () => {
  let db: DataSource;
  let consumer: OpsAdminProjectionConsumer;
  const taskId = `task-${randomUUID()}`;
  const consumerGroup = `ops-e2e-${randomUUID()}`;
  const topic = 'blujet.events.v1';
  const dlqConfig = {
    enabled: true,
    maxAttempts: 3,
    operatorToken: 'ops-admin-e2e-operator-token-value',
  } as const;
  const event = (version: number, assigneeId = 'operator-1') =>
    createCartableTaskProjectedEvent(
      {
        id: taskId,
        version,
        assigneeId,
        category: CartableCategory.ADMIN,
        sourceType: CartableSourceType.MANAGER_MESSAGE,
        sourceId: 'message-1',
        status: CartableStatus.OPEN,
        resolvedAt: null,
        readAt: null,
        createdAt: new Date('2026-09-10T09:00:00.000Z'),
      },
      {
        auditId: `audit-${version}`,
        correlationId: `request-${version}`,
        idempotencyKey: `cartable-projected:${taskId}:v${version}`,
      },
    );

  function kafkaPayload(
    input: ReturnType<typeof event>,
    options: { value?: Buffer; offset?: string; highWatermark?: string } = {},
  ): EachMessagePayload {
    return {
      topic,
      partition: 2,
      heartbeat: jest.fn<Promise<void>, []>().mockResolvedValue(),
      pause: jest.fn(),
      message: {
        offset: options.offset ?? '11',
        highWatermark: options.highWatermark ?? '20',
        key: Buffer.from(
          `${input.producer}:${input.aggregateType}:${input.aggregateId}`,
        ),
        value: options.value ?? Buffer.from(JSON.stringify(input)),
        headers: {
          'event-id': Buffer.from(input.eventId),
          'correlation-id': Buffer.from(input.correlationId),
          'event-version': Buffer.from('1'),
          'event-schema-id': Buffer.from(
            'blujet.ops-admin.CartableTaskProjected.v1',
          ),
        },
      },
    } as EachMessagePayload;
  }

  beforeAll(async () => {
    db = await new DataSource(
      opsAdminProjectionDataSourceOptions(
        process.env.OPS_ADMIN_PROJECTION_DATABASE_URL,
      ),
    ).initialize();
    consumer = new OpsAdminProjectionConsumer(new OpsAdminProjectionStore(db));
  });

  afterEach(async () => {
    if (!db?.isInitialized) return;
    await db
      .getRepository(OpsAdminKafkaProcessingFailure)
      .delete({ consumerGroup, topic });
    await db.getRepository(OpsAdminCartableEventReceipt).delete({ taskId });
    await db
      .getRepository(OpsAdminKafkaConsumerCheckpoint)
      .delete({ consumerGroup, topic });
    await db
      .getRepository(OpsAdminCartableTaskProjection)
      .delete({ id: taskId });
  });

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it('applies newer snapshots and accepts exact, semantic and stale replays', async () => {
    const first = event(1);
    await expect(consumer.consume(first)).resolves.toBe('applied');
    await expect(consumer.consume(first)).resolves.toBe('duplicate');
    await expect(consumer.consume(event(1))).resolves.toBe('duplicate');
    await expect(consumer.consume(event(3))).resolves.toBe('applied');
    await expect(consumer.consume(event(2))).resolves.toBe('stale');

    const projection = await db
      .getRepository(OpsAdminCartableTaskProjection)
      .findOneByOrFail({ id: taskId });
    expect(projection).toMatchObject({
      taskVersion: 3,
      auditId: 'audit-3',
      assigneeId: 'operator-1',
    });
    expect(
      await db.getRepository(OpsAdminCartableEventReceipt).countBy({ taskId }),
    ).toBe(4);
  });

  it('serves exact owner-scoped cartable counters from the projection', async () => {
    await consumer.consume(event(1));
    const read = new OpsAdminReadService(db);

    await expect(read.cartableCounts('operator-1')).resolves.toEqual({
      assigneeId: 'operator-1',
      counts: { ADMIN: 1, AGENCY: 0, MANAGER: 0 },
      statusCounts: {
        OPEN: 1,
        APPROVED: 0,
        REJECTED: 0,
        TRANSFERRED: 0,
      },
      totalOpen: 1,
      observedAt: expect.stringMatching(/Z$/) as string,
    });
    await expect(read.cartableCounts('operator-2')).resolves.toEqual({
      assigneeId: 'operator-2',
      counts: { ADMIN: 0, AGENCY: 0, MANAGER: 0 },
      statusCounts: {
        OPEN: 0,
        APPROVED: 0,
        REJECTED: 0,
        TRANSFERRED: 0,
      },
      totalOpen: 0,
      observedAt: expect.stringMatching(/Z$/) as string,
    });
  });

  it('fails closed for reused event IDs and equal-version conflicts', async () => {
    const first = event(1);
    await consumer.consume(first);
    await expect(
      consumer.consume({
        ...first,
        payload: { ...first.payload, assigneeId: 'operator-2' },
      }),
    ).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' },
    });
    await expect(
      consumer.consume(event(1, 'operator-2')),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      await db.getRepository(OpsAdminCartableEventReceipt).countBy({ taskId }),
    ).toBe(1);
    await expect(
      db.getRepository(OpsAdminCartableTaskProjection).findOneByOrFail({
        id: taskId,
      }),
    ).resolves.toMatchObject({ assigneeId: 'operator-1', taskVersion: 1 });
  });

  it('cannot regress under concurrent out-of-order deliveries', async () => {
    await consumer.consume(event(1));
    const results = await Promise.all([
      consumer.consume(event(4)),
      consumer.consume(event(3)),
    ]);

    expect(results).toContain('applied');
    await expect(
      db.getRepository(OpsAdminCartableTaskProjection).findOneByOrFail({
        id: taskId,
      }),
    ).resolves.toMatchObject({ taskVersion: 4, auditId: 'audit-4' });
  });

  it('advances durable checkpoint evidence monotonically for replay outcomes', async () => {
    const delivery = (nextOffset: string, highWatermark: string) => ({
      consumerGroup,
      topic,
      partition: 2,
      nextOffset,
      highWatermark,
    });
    const first = event(1);

    await expect(consumer.consume(first, delivery('12', '20'))).resolves.toBe(
      'applied',
    );
    await expect(consumer.consume(first, delivery('10', '18'))).resolves.toBe(
      'duplicate',
    );
    await expect(
      consumer.consume(event(1), delivery('11', '19')),
    ).resolves.toBe('duplicate');
    await expect(
      consumer.consume(event(3), delivery('13', '21')),
    ).resolves.toBe('applied');
    await expect(
      consumer.consume(event(2), delivery('14', '22')),
    ).resolves.toBe('stale');

    await expect(
      db.getRepository(OpsAdminKafkaConsumerCheckpoint).findOneByOrFail({
        consumerGroup,
        topic,
        partition: 2,
      }),
    ).resolves.toMatchObject({ nextOffset: '14', highWatermark: '22' });
    await expect(
      new OpsAdminProjectionStore(db).getCheckpointState(consumerGroup, topic),
    ).resolves.toMatchObject({ partitions: [2], maxLag: '8' });
  });

  it('rolls back projection state when checkpoint persistence fails', async () => {
    await expect(
      consumer.consume(event(1), {
        consumerGroup: 'x'.repeat(129),
        topic,
        partition: 2,
        nextOffset: '12',
        highWatermark: '20',
      }),
    ).rejects.toThrow();

    await expect(
      db
        .getRepository(OpsAdminCartableTaskProjection)
        .findOneBy({ id: taskId }),
    ).resolves.toBeNull();
    expect(
      await db.getRepository(OpsAdminCartableEventReceipt).countBy({ taskId }),
    ).toBe(0);
  });

  it('replays an acknowledgement gap without duplicate projection rows', async () => {
    const input = event(1);
    const dlq = new OpsAdminDlqStore(db);
    const handler = new OpsAdminKafkaHandler(consumer, dlq, dlqConfig);
    const firstAck = jest
      .fn<Promise<void>, [unknown]>()
      .mockRejectedValue(new Error('broker unavailable'));
    const secondAck = jest.fn<Promise<void>, [unknown]>().mockResolvedValue();

    await expect(
      handler.runConfig({ commitOffsets: firstAck }, { topic, consumerGroup })
        .eachMessage!(kafkaPayload(input)),
    ).rejects.toThrow('Ops/Admin Kafka processing failed');

    await handler.runConfig(
      { commitOffsets: secondAck },
      { topic, consumerGroup },
    ).eachMessage!(kafkaPayload(input));

    expect(firstAck).toHaveBeenCalledTimes(1);
    expect(secondAck).toHaveBeenCalledWith([
      { topic: 'blujet.events.v1', partition: 2, offset: '12' },
    ]);
    expect(
      await db.getRepository(OpsAdminCartableTaskProjection).countBy({
        id: taskId,
      }),
    ).toBe(1);
    expect(
      await db.getRepository(OpsAdminCartableEventReceipt).countBy({ taskId }),
    ).toBe(1);
    await expect(
      db.getRepository(OpsAdminKafkaConsumerCheckpoint).findOneByOrFail({
        consumerGroup,
        topic,
        partition: 2,
      }),
    ).resolves.toMatchObject({ nextOffset: '12', highWatermark: '20' });
    expect(
      await db
        .getRepository(OpsAdminKafkaProcessingFailure)
        .countBy({ consumerGroup, topic }),
    ).toBe(0);
  });

  it('quarantines malformed payloads and skips only after an audited approval', async () => {
    const input = event(1);
    const dlq = new OpsAdminDlqStore(db);
    const handler = new OpsAdminKafkaHandler(consumer, dlq, dlqConfig);
    const commitOffsets = jest
      .fn<Promise<void>, [unknown]>()
      .mockResolvedValue();
    const invalidPayload = kafkaPayload(input, {
      value: Buffer.from('{"passengerNationalId":"1234567890"'),
    });
    const eachMessage = handler.runConfig(
      { commitOffsets },
      { topic, consumerGroup },
    ).eachMessage!;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(eachMessage(invalidPayload)).rejects.toThrow(
        'Ops/Admin Kafka processing failed',
      );
    }

    const failure = await db
      .getRepository(OpsAdminKafkaProcessingFailure)
      .findOneByOrFail({ consumerGroup, topic, partition: 2, offset: '11' });
    expect(failure).toMatchObject({
      eventId: null,
      stage: OpsAdminKafkaFailureStage.TRANSPORT,
      attempts: 3,
      totalAttempts: 3,
      status: OpsAdminKafkaFailureStatus.QUARANTINED,
    });
    expect(JSON.stringify(failure)).not.toContain('1234567890');
    expect(commitOffsets).not.toHaveBeenCalled();

    await expect(eachMessage(invalidPayload)).rejects.toThrow(
      'Ops/Admin Kafka processing failed',
    );
    await dlq.approve(
      failure.id,
      'skip',
      'operator-e2e',
      'MESSAGE_REJECTED_AFTER_REVIEW',
    );
    await eachMessage(invalidPayload);

    expect(commitOffsets).toHaveBeenCalledWith([
      { topic, partition: 2, offset: '12' },
    ]);
    await expect(
      db.getRepository(OpsAdminKafkaProcessingFailure).findOneByOrFail({
        id: failure.id,
      }),
    ).resolves.toMatchObject({
      status: OpsAdminKafkaFailureStatus.SKIPPED,
      approvedBy: 'operator-e2e',
      approvalReason: 'MESSAGE_REJECTED_AFTER_REVIEW',
    });
    await expect(
      db.getRepository(OpsAdminKafkaConsumerCheckpoint).findOneByOrFail({
        consumerGroup,
        topic,
        partition: 2,
      }),
    ).resolves.toMatchObject({ nextOffset: '12', highWatermark: '20' });
  });

  it('starts a bounded retry cycle and resolves after a successful replay', async () => {
    const input = event(1);
    const dlq = new OpsAdminDlqStore(db);
    const failingConsumer = {
      consume: jest.fn().mockRejectedValue(new Error('private detail')),
    } as unknown as OpsAdminProjectionConsumer;
    const failingHandler = new OpsAdminKafkaHandler(
      failingConsumer,
      dlq,
      dlqConfig,
    );
    const commitOffsets = jest
      .fn<Promise<void>, [unknown]>()
      .mockResolvedValue();
    const payload = kafkaPayload(input);
    const failingEachMessage = failingHandler.runConfig(
      { commitOffsets },
      { topic, consumerGroup },
    ).eachMessage!;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(failingEachMessage(payload)).rejects.toThrow(
        'Ops/Admin Kafka processing failed',
      );
    }
    const quarantined = await db
      .getRepository(OpsAdminKafkaProcessingFailure)
      .findOneByOrFail({ consumerGroup, topic, partition: 2, offset: '11' });
    await dlq.approve(
      quarantined.id,
      'retry',
      'operator-e2e',
      'PROJECTION_FIX_DEPLOYED',
    );

    await expect(failingEachMessage(payload)).rejects.toThrow(
      'Ops/Admin Kafka processing failed',
    );
    await expect(
      db.getRepository(OpsAdminKafkaProcessingFailure).findOneByOrFail({
        id: quarantined.id,
      }),
    ).resolves.toMatchObject({
      status: OpsAdminKafkaFailureStatus.RETRYING,
      attempts: 1,
      totalAttempts: 4,
      approvedBy: 'operator-e2e',
      approvalReason: 'PROJECTION_FIX_DEPLOYED',
    });

    const recoveredHandler = new OpsAdminKafkaHandler(consumer, dlq, dlqConfig);
    await recoveredHandler.runConfig(
      { commitOffsets },
      { topic, consumerGroup },
    ).eachMessage!(payload);

    await expect(
      db.getRepository(OpsAdminKafkaProcessingFailure).findOneByOrFail({
        id: quarantined.id,
      }),
    ).resolves.toMatchObject({
      eventId: input.eventId,
      stage: OpsAdminKafkaFailureStage.PROJECTION,
      status: OpsAdminKafkaFailureStatus.RESOLVED,
      attempts: 1,
      totalAttempts: 4,
    });
    expect(
      await db.getRepository(OpsAdminCartableTaskProjection).countBy({
        id: taskId,
      }),
    ).toBe(1);
  });

  it('rejects a different payload at the same delivery coordinate', async () => {
    const dlq = new OpsAdminDlqStore(db);
    const handler = new OpsAdminKafkaHandler(consumer, dlq, dlqConfig);
    const commitOffsets = jest
      .fn<Promise<void>, [unknown]>()
      .mockResolvedValue();
    const first = kafkaPayload(event(1), { value: Buffer.from('{') });
    const changed = kafkaPayload(event(1), { value: Buffer.from('[]') });
    const eachMessage = handler.runConfig(
      { commitOffsets },
      { topic, consumerGroup },
    ).eachMessage!;

    await expect(eachMessage(first)).rejects.toThrow(
      'Ops/Admin Kafka processing failed',
    );
    const stored = await db
      .getRepository(OpsAdminKafkaProcessingFailure)
      .findOneByOrFail({ consumerGroup, topic, partition: 2, offset: '11' });
    await expect(eachMessage(changed)).rejects.toThrow(
      'Ops/Admin Kafka processing failed',
    );
    await expect(
      db.getRepository(OpsAdminKafkaProcessingFailure).findOneByOrFail({
        id: stored.id,
      }),
    ).resolves.toMatchObject({ fingerprint: stored.fingerprint, attempts: 1 });
  });

  it('reverts and reapplies the additive checkpoint migration', async () => {
    const migration = new OpsAdminKafkaConsumerCheckpoints1794038400000();
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await migration.down(runner);
      await expect(
        runner.hasTable('ops.kafka_consumer_checkpoints'),
      ).resolves.toBe(false);
      await migration.up(runner);
      await expect(
        runner.hasTable('ops.kafka_consumer_checkpoints'),
      ).resolves.toBe(true);
    } finally {
      await runner.release();
    }
  });

  it('reverts and reapplies the additive failure-quarantine migration', async () => {
    const migration = new OpsAdminKafkaFailureQuarantine1794124800000();
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await migration.down(runner);
      await expect(
        runner.hasTable('ops.kafka_processing_failures'),
      ).resolves.toBe(false);
      await migration.up(runner);
      await expect(
        runner.hasTable('ops.kafka_processing_failures'),
      ).resolves.toBe(true);
    } finally {
      await runner.release();
    }
  });
});
