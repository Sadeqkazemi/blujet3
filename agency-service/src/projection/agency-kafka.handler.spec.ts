import { randomUUID } from 'node:crypto';
import type { EachMessagePayload } from 'kafkajs';
import type { AgencyProjectionEvent } from './agency-projection-event';
import { AgencyKafkaHandler } from './agency-kafka.handler';
import type { AgencyProjectionConsumer } from './agency-projection.consumer';

describe('AgencyKafkaHandler', () => {
  const event: AgencyProjectionEvent = {
    eventId: randomUUID(),
    eventType: 'AgencyProfileProjected',
    eventVersion: 1,
    occurredAt: '2026-09-13T10:00:00.000Z',
    producer: 'core-agency',
    aggregateType: 'AgencyProfile',
    aggregateId: 'agency-1',
    correlationId: 'request-1',
    idempotencyKey: 'agency-profile-1',
    payload: {
      auditId: 'audit-1',
      recordVersion: 1,
      licenseNo: 'LICENSE-SECRET',
      managerName: 'مدیر آژانس',
      phone: '02100000000',
      email: 'private@example.invalid',
      city: 'تهران',
      address: 'نشانی محرمانه',
      tier: 'NORMAL',
      suspendedAt: null,
      suspendReason: null,
      joinedAt: '2026-09-13T10:00:00.000Z',
    },
  };
  const subscription = {
    topic: 'blujet.events.v1',
    consumerGroup: 'agency-v1',
  };
  const agency = {
    consume: jest.fn<
      Promise<'applied' | 'duplicate' | 'stale'>,
      [unknown, unknown?]
    >(),
  };
  const commitOffsets = jest.fn<Promise<void>, [unknown]>().mockResolvedValue();
  const handler = new AgencyKafkaHandler(
    agency as unknown as AgencyProjectionConsumer,
  );

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
        highWatermark: '8',
        key: Buffer.from(
          `${event.producer}:${event.aggregateType}:${event.aggregateId}`,
        ),
        value: Buffer.from(JSON.stringify(event)),
        headers: {
          'event-id': Buffer.from(event.eventId),
          'correlation-id': Buffer.from(event.correlationId),
          'event-version': Buffer.from('1'),
          'event-schema-id': Buffer.from(
            'blujet.agency.AgencyProfileProjected.v1',
          ),
        },
      },
      ...overrides,
    } as EachMessagePayload;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    agency.consume.mockResolvedValue('applied');
    commitOffsets.mockResolvedValue();
  });

  it('commits the offset only after the projection transaction returns', async () => {
    const order: string[] = [];
    agency.consume.mockImplementation(() => {
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
    expect(agency.consume).toHaveBeenCalledWith(event, {
      consumerGroup: 'agency-v1',
      topic: subscription.topic,
      partition: 0,
      nextOffset: '5',
      highWatermark: '8',
    });
  });

  it.each(['applied', 'duplicate', 'stale'] as const)(
    'acknowledges a successfully handled %s delivery',
    async (result) => {
      agency.consume.mockResolvedValue(result);

      await handler.runConfig({ commitOffsets }, subscription).eachMessage!(
        payload(),
      );

      expect(commitOffsets).toHaveBeenCalledWith([
        { topic: subscription.topic, partition: 0, offset: '5' },
      ]);
    },
  );

  it('accepts legacy v1 backlog without a schema header while disabled', async () => {
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

    expect(agency.consume).toHaveBeenCalledWith(event, {
      consumerGroup: 'agency-v1',
      topic: subscription.topic,
      partition: 0,
      nextOffset: '5',
      highWatermark: '8',
    });
    expect(commitOffsets).toHaveBeenCalledTimes(1);
  });

  it('requires the exact schema header after schema admission cutover', async () => {
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
    ).rejects.toThrow('Agency Kafka processing failed');
    expect(agency.consume).not.toHaveBeenCalled();
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it.each([
    { topic: 'wrong-topic' },
    { partition: -1 },
    { partition: 0.5 },
    { message: { ...payload().message, offset: '4x' } },
    { message: { ...payload().message, highWatermark: '4' } },
    { message: { ...payload().message, highWatermark: '4x' } },
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
          'event-schema-id': Buffer.from(
            'blujet.agency.AgencyInvoiceProjected.v1',
          ),
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
      ).rejects.toThrow('Agency Kafka processing failed');
      expect(agency.consume).not.toHaveBeenCalled();
      expect(commitOffsets).not.toHaveBeenCalled();
    },
  );

  it('rejects an oversized value before projection', async () => {
    await expect(
      handler.runConfig({ commitOffsets }, { ...subscription, maxBytes: 8 })
        .eachMessage!(payload()),
    ).rejects.toThrow('Agency Kafka processing failed');
    expect(agency.consume).not.toHaveBeenCalled();
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it.each([1, 2])(
    'does not acknowledge heartbeat failure at stage %s',
    async (stage) => {
      const heartbeat = jest.fn<Promise<void>, []>().mockResolvedValue();
      if (stage === 1) heartbeat.mockRejectedValueOnce(new Error('secret'));
      else
        heartbeat
          .mockResolvedValueOnce()
          .mockRejectedValueOnce(new Error('secret'));

      await expect(
        handler.runConfig({ commitOffsets }, subscription).eachMessage!(
          payload({ heartbeat }),
        ),
      ).rejects.toThrow('Agency Kafka processing failed');
      expect(agency.consume).toHaveBeenCalledTimes(stage - 1);
      expect(commitOffsets).not.toHaveBeenCalled();
    },
  );

  it('keeps projection failures retryable and sanitizes the error', async () => {
    agency.consume.mockRejectedValue(
      new Error('private@example.invalid 02100000000 LICENSE-SECRET'),
    );

    const error: unknown = await handler.runConfig(
      { commitOffsets },
      subscription,
    ).eachMessage!(payload()).catch((failure: unknown) => failure);

    expect(error).toEqual(new Error('Agency Kafka processing failed'));
    expect(error).not.toHaveProperty('cause');
    expect(JSON.stringify(error)).not.toContain('private@example.invalid');
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it('keeps acknowledgement gaps replayable', async () => {
    commitOffsets.mockRejectedValue(new Error('broker unavailable'));

    await expect(
      handler.runConfig({ commitOffsets }, subscription).eachMessage!(
        payload(),
      ),
    ).rejects.toThrow('Agency Kafka processing failed');
    expect(agency.consume).toHaveBeenCalledTimes(1);
  });

  it('validates and snapshots the subscription byte limit', async () => {
    expect(() => handler.runConfig({ commitOffsets }, { topic: '' })).toThrow(
      'Invalid Agency Kafka subscription',
    );
    expect(() =>
      handler.runConfig(
        { commitOffsets },
        { topic: subscription.topic, consumerGroup: `a${'b'.repeat(128)}` },
      ),
    ).toThrow('Invalid Agency Kafka subscription');
    const mutable = { ...subscription, maxBytes: 8 };
    const config = handler.runConfig({ commitOffsets }, mutable);
    mutable.maxBytes = 256 * 1024;

    await expect(config.eachMessage!(payload())).rejects.toThrow(
      'Agency Kafka processing failed',
    );
    expect(agency.consume).not.toHaveBeenCalled();
  });

  it('increments large offsets without number rounding', async () => {
    const offset = '9007199254740993';

    await handler.runConfig({ commitOffsets }, subscription).eachMessage!(
      payload({
        message: {
          ...payload().message,
          offset,
          highWatermark: '9007199254740995',
        } as unknown as EachMessagePayload['message'],
      }),
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
