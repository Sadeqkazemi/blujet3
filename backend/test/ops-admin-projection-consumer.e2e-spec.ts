import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EachMessagePayload } from 'kafkajs';
import { DataSource } from 'typeorm';
import { createCartableTaskProjectedEvent } from '../src/common/events/ops-admin-events';
import { OpsAdminCartableEventReceipt } from '../src/database/ops-admin-projection-entities/ops-admin-cartable-event-receipt.entity';
import { OpsAdminCartableTaskProjection } from '../src/database/ops-admin-projection-entities/ops-admin-cartable-task.entity';
import { opsAdminProjectionDataSourceOptions } from '../src/database/ops-admin-projection-data-source.options';
import {
  CartableCategory,
  CartableSourceType,
  CartableStatus,
} from '../src/database/enums';
import { OpsAdminKafkaHandler } from '../src/modules/ops-admin/ops-admin-kafka.handler';
import { OpsAdminProjectionConsumer } from '../src/modules/ops-admin/ops-admin-projection.consumer';
import { OpsAdminProjectionStore } from '../src/modules/ops-admin/ops-admin-projection.store';

describe('Ops/Admin ordered projection consumer (PostgreSQL)', () => {
  let db: DataSource;
  let consumer: OpsAdminProjectionConsumer;
  const taskId = `task-${randomUUID()}`;
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

  function kafkaPayload(input: ReturnType<typeof event>): EachMessagePayload {
    return {
      topic: 'blujet.events.v1',
      partition: 2,
      heartbeat: jest.fn<Promise<void>, []>().mockResolvedValue(),
      pause: jest.fn(),
      message: {
        offset: '11',
        key: Buffer.from(
          `${input.producer}:${input.aggregateType}:${input.aggregateId}`,
        ),
        value: Buffer.from(JSON.stringify(input)),
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
    await db.getRepository(OpsAdminCartableEventReceipt).delete({ taskId });
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

  it('replays an acknowledgement gap without duplicate projection rows', async () => {
    const input = event(1);
    const handler = new OpsAdminKafkaHandler(consumer);
    const firstAck = jest
      .fn<Promise<void>, [unknown]>()
      .mockRejectedValue(new Error('broker unavailable'));
    const secondAck = jest.fn<Promise<void>, [unknown]>().mockResolvedValue();

    await expect(
      handler.runConfig(
        { commitOffsets: firstAck },
        { topic: 'blujet.events.v1' },
      ).eachMessage!(kafkaPayload(input)),
    ).rejects.toThrow('Ops/Admin Kafka processing failed');

    await handler.runConfig(
      { commitOffsets: secondAck },
      { topic: 'blujet.events.v1' },
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
  });
});
