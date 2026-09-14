import { randomUUID } from 'node:crypto';
import type { EachMessagePayload } from 'kafkajs';
import { createCartableTaskProjectedEvent } from '../../common/events/ops-admin-events';
import type { OpsAdminDlqConfig } from '../../config/ops-admin-dlq.config';
import {
  CartableCategory,
  CartableSourceType,
  CartableStatus,
} from '../../database/enums';
import type { OpsAdminKafkaFailureStage } from '../../database/ops-admin-projection-entities/ops-admin-kafka-processing-failure.entity';
import {
  type OpsAdminDlqStore,
  type OpsAdminFailedDelivery,
  type OpsAdminFailureAction,
} from './ops-admin-dlq.store';
import { OpsAdminKafkaHandler } from './ops-admin-kafka.handler';
import type { OpsAdminProjectionConsumer } from './ops-admin-projection.consumer';

describe('OpsAdminKafkaHandler', () => {
  const event = createCartableTaskProjectedEvent(
    {
      id: 'task-1',
      version: 1,
      assigneeId: 'operator-1',
      category: CartableCategory.ADMIN,
      sourceType: CartableSourceType.MANAGER_MESSAGE,
      sourceId: 'message-1',
      status: CartableStatus.OPEN,
      resolvedAt: null,
      readAt: null,
      createdAt: new Date('2026-09-14T09:00:00.000Z'),
    },
    {
      auditId: 'audit-1',
      correlationId: 'request-1',
      idempotencyKey: 'cartable-projected:task-1:v1',
    },
  );
  const subscription = { topic: 'blujet.events.v1' };
  const opsAdmin = {
    consume: jest.fn<
      Promise<'applied' | 'duplicate' | 'stale'>,
      [unknown, unknown?]
    >(),
  };
  const commitOffsets = jest.fn<Promise<void>, [unknown]>().mockResolvedValue();
  const dlq = {
    actionFor: jest
      .fn<Promise<OpsAdminFailureAction>, [OpsAdminFailedDelivery]>()
      .mockResolvedValue('process'),
    recordFailure: jest
      .fn<
        Promise<'retry' | 'quarantined'>,
        [
          OpsAdminFailedDelivery,
          OpsAdminKafkaFailureStage,
          string | null,
          number,
        ]
      >()
      .mockResolvedValue('retry'),
    markResolved: jest
      .fn<Promise<void>, [OpsAdminFailedDelivery]>()
      .mockResolvedValue(undefined),
    markSkipped: jest
      .fn<Promise<void>, [OpsAdminFailedDelivery]>()
      .mockResolvedValue(undefined),
  };
  const handler = new OpsAdminKafkaHandler(
    opsAdmin as unknown as OpsAdminProjectionConsumer,
  );

  function dlqHandler(
    config: OpsAdminDlqConfig = {
      enabled: true,
      maxAttempts: 3,
      operatorToken: 'ops-admin-operator-token-at-least-32-characters',
    },
  ): OpsAdminKafkaHandler {
    return new OpsAdminKafkaHandler(
      opsAdmin as unknown as OpsAdminProjectionConsumer,
      dlq as unknown as OpsAdminDlqStore,
      config,
    );
  }

  function payload(
    overrides: Partial<EachMessagePayload> = {},
  ): EachMessagePayload {
    return {
      topic: subscription.topic,
      partition: 0,
      heartbeat: jest.fn<Promise<void>, []>().mockResolvedValue(),
      pause: jest.fn(),
      message: {
        offset: '4',
        key: Buffer.from(
          `${event.producer}:${event.aggregateType}:${event.aggregateId}`,
        ),
        value: Buffer.from(JSON.stringify(event)),
        headers: {
          'event-id': Buffer.from(event.eventId),
          'correlation-id': Buffer.from(event.correlationId),
          'event-version': Buffer.from('1'),
          'event-schema-id': Buffer.from(
            'blujet.ops-admin.CartableTaskProjected.v1',
          ),
        },
      },
      ...overrides,
    } as EachMessagePayload;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    opsAdmin.consume.mockResolvedValue('applied');
    commitOffsets.mockResolvedValue();
    dlq.actionFor.mockResolvedValue('process');
    dlq.recordFailure.mockResolvedValue('retry');
    dlq.markResolved.mockResolvedValue(undefined);
    dlq.markSkipped.mockResolvedValue(undefined);
  });

  it('commits the next offset only after the projection transaction', async () => {
    const order: string[] = [];
    const delivery = payload({
      heartbeat: jest.fn(() => {
        order.push('heartbeat');
        return Promise.resolve();
      }),
    });
    opsAdmin.consume.mockImplementation(() => {
      order.push('projection');
      return Promise.resolve('applied');
    });
    const client = {
      commitOffsets: jest.fn(() => {
        order.push('ack');
        return Promise.resolve();
      }),
    };

    const config = handler.runConfig(client, subscription);
    expect(config.autoCommit).toBe(false);
    expect(config.partitionsConsumedConcurrently).toBe(1);
    await config.eachMessage!(delivery);

    expect(order).toEqual(['heartbeat', 'projection', 'heartbeat', 'ack']);
    expect(client.commitOffsets).toHaveBeenCalledWith([
      { topic: subscription.topic, partition: 0, offset: '5' },
    ]);
  });

  it.each(['applied', 'duplicate', 'stale'] as const)(
    'acknowledges a successfully handled %s delivery',
    async (result) => {
      opsAdmin.consume.mockResolvedValue(result);

      await handler.runConfig({ commitOffsets }, subscription).eachMessage!(
        payload(),
      );

      expect(commitOffsets).toHaveBeenCalledWith([
        { topic: subscription.topic, partition: 0, offset: '5' },
      ]);
    },
  );

  it('persists validated delivery coordinates before acknowledgement', async () => {
    const message = {
      ...payload().message,
      highWatermark: '9',
    } as EachMessagePayload['message'];

    await handler.runConfig(
      { commitOffsets },
      { ...subscription, consumerGroup: 'ops-projection-v1' },
    ).eachMessage!(payload({ message }));

    expect(opsAdmin.consume).toHaveBeenCalledWith(event, {
      consumerGroup: 'ops-projection-v1',
      topic: subscription.topic,
      partition: 0,
      nextOffset: '5',
      highWatermark: '9',
    });
    expect(commitOffsets).toHaveBeenCalledTimes(1);
    expect(opsAdmin.consume.mock.invocationCallOrder[0]).toBeLessThan(
      commitOffsets.mock.invocationCallOrder[0],
    );
  });

  it('rejects an invalid consumer group before processing', () => {
    expect(() =>
      handler.runConfig(
        { commitOffsets },
        { ...subscription, consumerGroup: '../shared' },
      ),
    ).toThrow('Invalid Ops/Admin Kafka consumer group');
    expect(opsAdmin.consume).not.toHaveBeenCalled();
  });

  it('accepts legacy v1 backlog without a schema header while optional', async () => {
    const message = payload().message;
    await handler.runConfig({ commitOffsets }, subscription).eachMessage!(
      payload({
        message: {
          ...message,
          headers: {
            'event-id': Buffer.from(event.eventId),
            'correlation-id': Buffer.from(event.correlationId),
            'event-version': Buffer.from('1'),
          },
        } as EachMessagePayload['message'],
      }),
    );

    expect(opsAdmin.consume).toHaveBeenCalledWith(event);
    expect(commitOffsets).toHaveBeenCalledTimes(1);
  });

  it('requires the exact schema header after the strict gate', async () => {
    const message = payload().message;

    await expect(
      handler.runConfig(
        { commitOffsets },
        { ...subscription, requireSchemaId: true },
      ).eachMessage!(
        payload({
          message: {
            ...message,
            headers: {
              'event-id': Buffer.from(event.eventId),
              'correlation-id': Buffer.from(event.correlationId),
              'event-version': Buffer.from('1'),
            },
          } as EachMessagePayload['message'],
        }),
      ),
    ).rejects.toThrow('Ops/Admin Kafka processing failed');
    expect(opsAdmin.consume).not.toHaveBeenCalled();
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it.each([
    { topic: 'wrong-topic' },
    { partition: -1 },
    { partition: 0.5 },
    { message: { ...payload().message, offset: '4x' } },
    { message: { ...payload().message, highWatermark: '4' } },
    { message: { ...payload().message, key: Buffer.from('wrong') } },
    { message: { ...payload().message, value: null } },
    { message: { ...payload().message, value: Buffer.from('{') } },
    { message: { ...payload().message, value: Buffer.from([0xc3, 0x28]) } },
    {
      message: {
        ...payload().message,
        value: Buffer.from(JSON.stringify({ ...event, producer: 'intruder' })),
        key: Buffer.from(
          `intruder:${event.aggregateType}:${event.aggregateId}`,
        ),
      },
    },
    {
      message: {
        ...payload().message,
        headers: {
          ...payload().message.headers,
          'event-id': Buffer.from(randomUUID()),
        },
      },
    },
    {
      message: {
        ...payload().message,
        headers: {
          ...payload().message.headers,
          'event-schema-id': Buffer.from('blujet.ops-admin.OtherEvent.v1'),
        },
      },
    },
  ] as Array<Partial<EachMessagePayload>>)(
    'rejects malformed transport before projection (%#)',
    async (change) => {
      await expect(
        handler.runConfig({ commitOffsets }, subscription).eachMessage!(
          payload(change),
        ),
      ).rejects.toThrow('Ops/Admin Kafka processing failed');
      expect(opsAdmin.consume).not.toHaveBeenCalled();
      expect(commitOffsets).not.toHaveBeenCalled();
    },
  );

  it('rejects an oversized payload before projection', async () => {
    await expect(
      handler.runConfig({ commitOffsets }, { ...subscription, maxBytes: 8 })
        .eachMessage!(payload()),
    ).rejects.toThrow('Ops/Admin Kafka processing failed');
    expect(opsAdmin.consume).not.toHaveBeenCalled();
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it.each([1, 2])(
    'does not acknowledge heartbeat failure at stage %s',
    async (stage) => {
      const heartbeat = jest.fn<Promise<void>, []>().mockResolvedValue();
      if (stage === 1) heartbeat.mockRejectedValueOnce(new Error('private'));
      else
        heartbeat
          .mockResolvedValueOnce()
          .mockRejectedValueOnce(new Error('private'));

      await expect(
        handler.runConfig({ commitOffsets }, subscription).eachMessage!(
          payload({ heartbeat }),
        ),
      ).rejects.toThrow('Ops/Admin Kafka processing failed');
      expect(opsAdmin.consume).toHaveBeenCalledTimes(stage - 1);
      expect(commitOffsets).not.toHaveBeenCalled();
    },
  );

  it('keeps projection failures retryable and sanitizes the error', async () => {
    opsAdmin.consume.mockRejectedValue(
      new Error('private task content and database connection'),
    );

    const error: unknown = await handler.runConfig(
      { commitOffsets },
      subscription,
    ).eachMessage!(payload()).catch((failure: unknown) => failure);

    expect(error).toEqual(new Error('Ops/Admin Kafka processing failed'));
    expect(error).not.toHaveProperty('cause');
    expect(JSON.stringify(error)).not.toContain('private task content');
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it('keeps acknowledgement gaps replayable', async () => {
    commitOffsets.mockRejectedValue(new Error('broker unavailable'));

    await expect(
      handler.runConfig({ commitOffsets }, subscription).eachMessage!(
        payload(),
      ),
    ).rejects.toThrow('Ops/Admin Kafka processing failed');
    expect(opsAdmin.consume).toHaveBeenCalledTimes(1);
  });

  it('validates and snapshots the subscription byte limit', async () => {
    expect(() => handler.runConfig({ commitOffsets }, { topic: '' })).toThrow();
    const mutable = { ...subscription, maxBytes: 8 };
    const config = handler.runConfig({ commitOffsets }, mutable);
    mutable.maxBytes = 256 * 1024;

    await expect(config.eachMessage!(payload())).rejects.toThrow(
      'Ops/Admin Kafka processing failed',
    );
    expect(opsAdmin.consume).not.toHaveBeenCalled();
  });

  it('increments large offsets without number rounding', async () => {
    const offset = '9007199254740993';

    await handler.runConfig({ commitOffsets }, subscription).eachMessage!(
      payload({ message: { ...payload().message, offset } }),
    );

    expect(commitOffsets).toHaveBeenCalledWith([
      {
        topic: subscription.topic,
        partition: 0,
        offset: '9007199254740994',
      },
    ]);
  });

  it('records a bounded projection failure without acknowledging it', async () => {
    opsAdmin.consume.mockRejectedValue(
      new Error('private task content and database connection'),
    );

    await expect(
      dlqHandler().runConfig(
        { commitOffsets },
        { ...subscription, consumerGroup: 'ops-projection-v1' },
      ).eachMessage!(payload()),
    ).rejects.toThrow('Ops/Admin Kafka processing failed');

    const [failed, stage, eventId, maxAttempts] =
      dlq.recordFailure.mock.calls[0];
    expect(failed).toMatchObject({
      consumerGroup: 'ops-projection-v1',
      topic: subscription.topic,
      partition: 0,
      offset: '4',
      nextOffset: '5',
    });
    expect(failed.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect({ stage, eventId, maxAttempts }).toEqual({
      stage: 'PROJECTION',
      eventId: event.eventId,
      maxAttempts: 3,
    });
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it('records malformed transport without retaining its content', async () => {
    await expect(
      dlqHandler().runConfig(
        { commitOffsets },
        { ...subscription, consumerGroup: 'ops-projection-v1' },
      ).eachMessage!(
        payload({
          message: {
            ...payload().message,
            value: Buffer.from('{"taskContent":"PRIVATE-CONTENT"'),
          } as EachMessagePayload['message'],
        }),
      ),
    ).rejects.toThrow('Ops/Admin Kafka processing failed');

    const [failed, stage, eventId] = dlq.recordFailure.mock.calls[0];
    expect(failed.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect({ stage, eventId }).toEqual({
      stage: 'TRANSPORT',
      eventId: null,
    });
    expect(JSON.stringify(failed)).not.toContain('PRIVATE-CONTENT');
    expect(opsAdmin.consume).not.toHaveBeenCalled();
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it('blocks quarantined deliveries without incrementing attempts', async () => {
    dlq.actionFor.mockResolvedValue('block');

    await expect(
      dlqHandler().runConfig(
        { commitOffsets },
        { ...subscription, consumerGroup: 'ops-projection-v1' },
      ).eachMessage!(payload()),
    ).rejects.toThrow('Ops/Admin Kafka processing failed');

    expect(opsAdmin.consume).not.toHaveBeenCalled();
    expect(dlq.recordFailure).not.toHaveBeenCalled();
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it('persists an approved skip before acknowledging the source offset', async () => {
    const order: string[] = [];
    dlq.actionFor.mockResolvedValue('skip');
    dlq.markSkipped.mockImplementation(() => {
      order.push('skip');
      return Promise.resolve();
    });
    const client = {
      commitOffsets: jest.fn(() => {
        order.push('ack');
        return Promise.resolve();
      }),
    };

    await dlqHandler().runConfig(client, {
      ...subscription,
      consumerGroup: 'ops-projection-v1',
    }).eachMessage!(payload());

    expect(order).toEqual(['skip', 'ack']);
    expect(opsAdmin.consume).not.toHaveBeenCalled();
    expect(client.commitOffsets).toHaveBeenCalledWith([
      { topic: subscription.topic, partition: 0, offset: '5' },
    ]);
  });

  it('fails closed when an approved skip cannot persist its checkpoint', async () => {
    dlq.actionFor.mockResolvedValue('skip');
    dlq.markSkipped.mockRejectedValue(new Error('private database detail'));

    await expect(
      dlqHandler().runConfig(
        { commitOffsets },
        { ...subscription, consumerGroup: 'ops-projection-v1' },
      ).eachMessage!(payload()),
    ).rejects.toThrow('Ops/Admin Kafka processing failed');

    expect(opsAdmin.consume).not.toHaveBeenCalled();
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it('fails closed without acknowledging when failure evidence cannot persist', async () => {
    opsAdmin.consume.mockRejectedValue(new Error('private task content'));
    dlq.recordFailure.mockRejectedValue(new Error('private database detail'));

    await expect(
      dlqHandler().runConfig(
        { commitOffsets },
        { ...subscription, consumerGroup: 'ops-projection-v1' },
      ).eachMessage!(payload()),
    ).rejects.toThrow('Ops/Admin Kafka processing failed');

    expect(dlq.recordFailure).toHaveBeenCalledTimes(1);
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it('replays a resolved projection when registry resolution persistence fails', async () => {
    dlq.markResolved.mockRejectedValue(new Error('private database detail'));

    await expect(
      dlqHandler().runConfig(
        { commitOffsets },
        { ...subscription, consumerGroup: 'ops-projection-v1' },
      ).eachMessage!(payload()),
    ).rejects.toThrow('Ops/Admin Kafka processing failed');

    expect(opsAdmin.consume).toHaveBeenCalledTimes(1);
    expect(dlq.recordFailure).not.toHaveBeenCalled();
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it('does not classify an acknowledgement gap as poison data', async () => {
    commitOffsets.mockRejectedValue(new Error('broker unavailable'));

    await expect(
      dlqHandler().runConfig(
        { commitOffsets },
        { ...subscription, consumerGroup: 'ops-projection-v1' },
      ).eachMessage!(payload()),
    ).rejects.toThrow('Ops/Admin Kafka processing failed');

    expect(opsAdmin.consume).toHaveBeenCalledTimes(1);
    expect(dlq.markResolved).toHaveBeenCalledTimes(1);
    expect(dlq.recordFailure).not.toHaveBeenCalled();
  });

  it('requires a consumer group and store when quarantine is enabled', () => {
    expect(() =>
      dlqHandler().runConfig({ commitOffsets }, subscription),
    ).toThrow('Ops/Admin DLQ requires a consumer group and store');
    expect(() =>
      new OpsAdminKafkaHandler(
        opsAdmin as unknown as OpsAdminProjectionConsumer,
        undefined,
        {
          enabled: true,
          maxAttempts: 3,
          operatorToken: 'ops-admin-operator-token-at-least-32-characters',
        },
      ).runConfig(
        { commitOffsets },
        { ...subscription, consumerGroup: 'ops-projection-v1' },
      ),
    ).toThrow('Ops/Admin DLQ requires a consumer group and store');
  });
});
