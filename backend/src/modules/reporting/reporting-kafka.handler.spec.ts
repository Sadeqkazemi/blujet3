import { randomUUID } from 'node:crypto';
import type { EachMessagePayload } from 'kafkajs';
import { createItineraryOrderCreated } from '../../common/events/core-itinerary-events';
import { ReportingEventConsumer } from './reporting-event-consumer';
import { ReportingKafkaHandler } from './reporting-kafka.handler';

describe('ReportingKafkaHandler', () => {
  const event = createItineraryOrderCreated(
    {
      id: 'order-1',
      version: 1,
      status: 'HELD',
      channel: 'SYSTEM',
      currency: 'IRR',
      fareIrr: 100n,
      taxIrr: 20n,
      extrasIrr: 0n,
      totalIrr: 120n,
      createdAt: new Date('2026-09-06T00:00:00.000Z'),
      holdExpiresAt: new Date('2026-09-06T00:15:00.000Z'),
    },
    {
      auditId: `audit-${randomUUID()}`,
      correlationId: `request-${randomUUID()}`,
      idempotencyKey: `order-${randomUUID()}`,
    },
  );
  const subscription = { topic: 'blujet.events.v1' };
  const reporting = {
    consume: jest
      .fn<
        ReturnType<ReportingEventConsumer['consume']>,
        Parameters<ReportingEventConsumer['consume']>
      >()
      .mockResolvedValue('applied'),
  };
  const commitOffsets = jest.fn().mockResolvedValue(undefined);
  const handler = new ReportingKafkaHandler(
    reporting as unknown as ReportingEventConsumer,
  );

  function payload(
    overrides: Partial<EachMessagePayload> = {},
  ): EachMessagePayload {
    return {
      topic: subscription.topic,
      partition: 0,
      heartbeat: jest.fn().mockResolvedValue(undefined),
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
        },
      },
      ...overrides,
    } as unknown as EachMessagePayload;
  }

  beforeEach(() => {
    jest.resetAllMocks();
    reporting.consume.mockResolvedValue('applied');
    commitOffsets.mockResolvedValue(undefined);
  });

  it('commits offset only after the Reporting transaction returns', async () => {
    const order: string[] = [];
    reporting.consume.mockImplementation(() => {
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
    await config.eachMessage!(payload());
    expect(order).toEqual(['projection', 'ack']);
    expect(client.commitOffsets).toHaveBeenCalledWith([
      { topic: subscription.topic, partition: 0, offset: '5' },
    ]);
  });

  it.each(['duplicate', 'stale'] as const)(
    'acknowledges a successfully handled %s delivery',
    async (result) => {
      reporting.consume.mockResolvedValue(result);
      await handler.runConfig({ commitOffsets }, subscription).eachMessage!(
        payload(),
      );
      expect(commitOffsets).toHaveBeenCalledWith([
        { topic: subscription.topic, partition: 0, offset: '5' },
      ]);
    },
  );

  it('forwards validated broker progress to the atomic projection', async () => {
    await handler.runConfig(
      { commitOffsets },
      { ...subscription, consumerGroup: 'blujet-reporting-v1' },
    ).eachMessage!(
      payload({
        message: {
          ...payload().message,
          highWatermark: '9',
        } as EachMessagePayload['message'],
      }),
    );

    expect(reporting.consume).toHaveBeenCalledWith(event, {
      consumerGroup: 'blujet-reporting-v1',
      topic: subscription.topic,
      partition: 0,
      nextOffset: '5',
      highWatermark: '9',
    });
  });

  it.each([
    { topic: 'other-topic' },
    { partition: -1 },
    { partition: 0.5 },
    { message: { ...payload().message, key: Buffer.from('wrong') } },
    { message: { ...payload().message, offset: '4x' } },
    {
      message: {
        ...payload().message,
        highWatermark: '9x',
      } as EachMessagePayload['message'],
    },
    { message: { ...payload().message, value: null } },
    { message: { ...payload().message, value: Buffer.from('{') } },
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
        headers: { ...payload().message.headers, 'event-id': Buffer.from('x') },
      },
    },
  ])('rejects malformed transport before Reporting (%#)', async (change) => {
    await expect(
      handler.runConfig({ commitOffsets }, subscription).eachMessage!(
        payload(change),
      ),
    ).rejects.toThrow('Reporting Kafka processing failed');
    expect(reporting.consume).not.toHaveBeenCalled();
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it('does not acknowledge projection failure and sanitizes its error', async () => {
    reporting.consume.mockRejectedValue(new Error('secret SQL value'));
    const error: unknown = await handler.runConfig(
      { commitOffsets },
      subscription,
    ).eachMessage!(payload()).catch((failure: unknown) => failure);
    expect(error).toEqual(new Error('Reporting Kafka processing failed'));
    expect(error).not.toHaveProperty('cause');
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it.each([1, 2])(
    'does not acknowledge heartbeat failure at stage %s',
    async (stage) => {
      const heartbeat = jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined);
      if (stage === 1) heartbeat.mockRejectedValueOnce(new Error('secret'));
      else
        heartbeat
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('secret'));
      await expect(
        handler.runConfig({ commitOffsets }, subscription).eachMessage!(
          payload({ heartbeat }),
        ),
      ).rejects.toThrow('Reporting Kafka processing failed');
      expect(reporting.consume).toHaveBeenCalledTimes(stage - 1);
      expect(commitOffsets).not.toHaveBeenCalled();
    },
  );

  it('keeps the event retryable when broker acknowledgement fails', async () => {
    commitOffsets.mockRejectedValue(new Error('broker unavailable'));
    await expect(
      handler.runConfig({ commitOffsets }, subscription).eachMessage!(
        payload(),
      ),
    ).rejects.toThrow('Reporting Kafka processing failed');
    expect(reporting.consume).toHaveBeenCalledTimes(1);
  });

  it('validates and snapshots the subscription byte limit', async () => {
    expect(() => handler.runConfig({ commitOffsets }, { topic: '' })).toThrow();
    const mutable = { ...subscription, maxBytes: 10 };
    const run = handler.runConfig({ commitOffsets }, mutable);
    mutable.maxBytes = 256 * 1024;
    await expect(run.eachMessage!(payload())).rejects.toThrow(
      'Reporting Kafka processing failed',
    );
    expect(reporting.consume).not.toHaveBeenCalled();
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
});
