import { randomUUID } from 'node:crypto';
import type { EachMessagePayload } from 'kafkajs';
import type { AgencyDlqConfig } from '../agency-dlq.config';
import type { AgencyKafkaFailureStage } from '../database/entities/agency-kafka-processing-failure.entity';
import {
  type AgencyDlqStore,
  type AgencyFailedDelivery,
  type AgencyFailureAction,
} from './agency-dlq.store';
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
  const dlq = {
    actionFor: jest
      .fn<Promise<AgencyFailureAction>, [AgencyFailedDelivery]>()
      .mockResolvedValue('process'),
    recordFailure: jest
      .fn<
        Promise<'retry' | 'quarantined'>,
        [AgencyFailedDelivery, AgencyKafkaFailureStage, string | null, number]
      >()
      .mockResolvedValue('retry'),
    markResolved: jest
      .fn<Promise<void>, [AgencyFailedDelivery]>()
      .mockResolvedValue(undefined),
    markSkipped: jest
      .fn<Promise<void>, [AgencyFailedDelivery]>()
      .mockResolvedValue(undefined),
  };
  const handler = new AgencyKafkaHandler(
    agency as unknown as AgencyProjectionConsumer,
    dlq as unknown as AgencyDlqStore,
    { enabled: false },
  );

  function dlqHandler(
    config: AgencyDlqConfig = {
      enabled: true,
      maxAttempts: 3,
      operatorToken: 'agency-operator-token-at-least-32-characters',
    },
  ): AgencyKafkaHandler {
    return new AgencyKafkaHandler(
      agency as unknown as AgencyProjectionConsumer,
      dlq as unknown as AgencyDlqStore,
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
    dlq.actionFor.mockResolvedValue('process');
    dlq.recordFailure.mockResolvedValue('retry');
    dlq.markResolved.mockResolvedValue(undefined);
    dlq.markSkipped.mockResolvedValue(undefined);
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

  it('records a bounded projection failure without acknowledging it', async () => {
    agency.consume.mockRejectedValue(
      new Error('private@example.invalid 02100000000 LICENSE-SECRET'),
    );

    await expect(
      dlqHandler().runConfig({ commitOffsets }, subscription).eachMessage!(
        payload(),
      ),
    ).rejects.toThrow('Agency Kafka processing failed');

    const [failed, stage, eventId, maxAttempts] =
      dlq.recordFailure.mock.calls[0];
    expect(failed).toMatchObject({
      consumerGroup: 'agency-v1',
      topic: subscription.topic,
      partition: 0,
      offset: '4',
      nextOffset: '5',
      highWatermark: '8',
    });
    expect(failed.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect({ stage, eventId, maxAttempts }).toEqual({
      stage: 'PROJECTION',
      eventId: event.eventId,
      maxAttempts: 3,
    });
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it('records malformed transport without persisting its content or acknowledging', async () => {
    await expect(
      dlqHandler().runConfig({ commitOffsets }, subscription).eachMessage!(
        payload({
          message: {
            ...payload().message,
            value: Buffer.from('{"licenseNo":"LICENSE-SECRET"'),
          } as EachMessagePayload['message'],
        }),
      ),
    ).rejects.toThrow('Agency Kafka processing failed');

    const [failed, stage, eventId] = dlq.recordFailure.mock.calls[0];
    expect(failed.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect({ stage, eventId }).toEqual({
      stage: 'TRANSPORT',
      eventId: null,
    });
    expect(JSON.stringify(failed)).not.toContain('LICENSE-SECRET');
    expect(agency.consume).not.toHaveBeenCalled();
    expect(commitOffsets).not.toHaveBeenCalled();
  });

  it('blocks quarantined deliveries without incrementing attempts', async () => {
    dlq.actionFor.mockResolvedValue('block');

    await expect(
      dlqHandler().runConfig({ commitOffsets }, subscription).eachMessage!(
        payload(),
      ),
    ).rejects.toThrow('Agency Kafka processing failed');

    expect(agency.consume).not.toHaveBeenCalled();
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

    await dlqHandler().runConfig(client, subscription).eachMessage!(payload());

    expect(order).toEqual(['skip', 'ack']);
    expect(agency.consume).not.toHaveBeenCalled();
    expect(dlq.recordFailure).not.toHaveBeenCalled();
    expect(client.commitOffsets).toHaveBeenCalledWith([
      { topic: subscription.topic, partition: 0, offset: '5' },
    ]);
  });

  it('does not classify an acknowledgement gap as poison data', async () => {
    commitOffsets.mockRejectedValue(new Error('broker unavailable'));

    await expect(
      dlqHandler().runConfig({ commitOffsets }, subscription).eachMessage!(
        payload(),
      ),
    ).rejects.toThrow('Agency Kafka processing failed');

    expect(agency.consume).toHaveBeenCalledTimes(1);
    expect(dlq.markResolved).toHaveBeenCalledTimes(1);
    expect(dlq.recordFailure).not.toHaveBeenCalled();
  });

  it('requires a consumer group when quarantine is enabled', () => {
    expect(() =>
      dlqHandler().runConfig({ commitOffsets }, { topic: subscription.topic }),
    ).toThrow('Agency DLQ requires a consumer group');
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
