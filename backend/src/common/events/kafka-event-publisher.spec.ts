import { Kafka } from 'kafkajs';
import { KafkaEventPublisher } from './kafka-event-publisher';
import { CanonicalEventType, createCanonicalEvent } from './canonical-events';
import { CoreItineraryEventSchemaCatalog } from './core-itinerary-event-schema';
import { createItineraryOrderCreated } from './core-itinerary-events';
import { LoyaltyEventSchemaCatalog } from './loyalty-event-schema';
import { createLoyaltyTierRuleProjected } from './loyalty-events';
import { OpsAdminEventSchemaCatalog } from './ops-admin-event-schema';
import { createCartableTaskProjectedEvent } from './ops-admin-events';

jest.mock('kafkajs', () => ({ Kafka: jest.fn(), logLevel: { NOTHING: 0 } }));

function publishedHeaders(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('Invalid publish');
  const request = value as Record<string, unknown>;
  if (!Array.isArray(request.messages) || request.messages.length !== 1)
    throw new Error('Invalid publish');
  const message: unknown = request.messages[0];
  if (!message || typeof message !== 'object')
    throw new Error('Invalid publish');
  const headers = (message as Record<string, unknown>).headers;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers))
    throw new Error('Invalid publish');
  return headers as Record<string, unknown>;
}

describe('KafkaEventPublisher', () => {
  const originalEnv = { ...process.env };
  const connect = jest.fn<Promise<void>, []>();
  const send = jest.fn<Promise<unknown[]>, [unknown]>();
  const disconnect = jest.fn<Promise<void>, []>();
  const producer = jest.fn(() => ({ connect, send, disconnect }));
  const event = () =>
    createCanonicalEvent({
      eventType: CanonicalEventType.ORDER_CREATED,
      producer: 'test',
      aggregateType: 'Order',
      aggregateId: 'order-1',
      correlationId: 'request-1',
      idempotencyKey: 'order-1-created',
      payload: {},
    });
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      KAFKA_EVENTS_ENABLED: 'true',
      KAFKA_BROKERS: 'localhost:9092',
    };
    for (const key of Object.keys(process.env))
      if (
        key.startsWith('KAFKA_') &&
        !['KAFKA_EVENTS_ENABLED', 'KAFKA_BROKERS'].includes(key)
      )
        delete process.env[key];
    jest.clearAllMocks();
    connect.mockReset().mockResolvedValue(undefined);
    send.mockReset().mockResolvedValue([]);
    disconnect.mockReset().mockResolvedValue(undefined);
    jest
      .mocked(Kafka)
      .mockImplementation(() => ({ producer }) as unknown as Kafka);
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does not create a client or connect while disabled', async () => {
    delete process.env.KAFKA_EVENTS_ENABLED;
    const publisher = new KafkaEventPublisher();
    await expect(publisher.publish(event())).resolves.toBe(false);
    await publisher.disconnect();
    expect(Kafka).not.toHaveBeenCalled();
  });
  it('shares initialization and waits for all-replica acknowledgment', async () => {
    const publisher = new KafkaEventPublisher();
    const first = event();
    await expect(
      Promise.all([publisher.publish(first), publisher.publish(event())]),
    ).resolves.toEqual([true, true]);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(producer).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotent: true,
        allowAutoTopicCreation: false,
        retry: { retries: 1 },
      }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        acks: -1,
        messages: [
          expect.objectContaining({
            key: 'test:Order:order-1',
            value: JSON.stringify(first),
          }),
        ],
      }),
    );
    await publisher.disconnect();
  });
  it('adds schema identity only to catalogued events', async () => {
    const publisher = new KafkaEventPublisher();
    const itinerary = createItineraryOrderCreated(
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
        createdAt: new Date('2026-09-09T00:00:00.000Z'),
        holdExpiresAt: new Date('2026-09-09T00:15:00.000Z'),
      },
      {
        auditId: 'audit-1',
        correlationId: 'request-1',
        idempotencyKey: 'order-created-1',
      },
    );
    await publisher.publish(itinerary);
    expect(publishedHeaders(send.mock.calls[0]?.[0])['event-schema-id']).toBe(
      CoreItineraryEventSchemaCatalog.OrderCreated.schemaId,
    );

    send.mockClear();
    const cartable = createCartableTaskProjectedEvent(
      {
        id: 'task-1',
        version: 1,
        assigneeId: 'staff-1',
        category: 'MANAGER',
        sourceType: null,
        sourceId: null,
        status: 'OPEN',
        resolvedAt: null,
        readAt: null,
        createdAt: new Date('2026-09-10T08:00:00.000Z'),
      },
      {
        auditId: 'audit-1',
        correlationId: 'request-1',
        idempotencyKey: 'task-1-v1',
      },
    );
    await publisher.publish(cartable);
    expect(publishedHeaders(send.mock.calls[0]?.[0])['event-schema-id']).toBe(
      OpsAdminEventSchemaCatalog.CartableTaskProjected.schemaId,
    );

    send.mockClear();
    const loyalty = createLoyaltyTierRuleProjected(
      {
        id: 'tier-rule-1',
        goldMinPoints: 5000,
        platinumMinPoints: 15000,
        cardRequestMinPoints: 5000,
        updatedById: 'staff-1',
        updatedAt: new Date('2026-09-11T08:30:00.000Z'),
        createdAt: new Date('2026-09-11T08:00:00.000Z'),
      },
      {
        auditId: 'audit-1',
        correlationId: 'request-1',
        idempotencyKey: 'tier-rule-1-v1',
        occurredAt: new Date('2026-09-11T08:30:00.000Z'),
        recordVersion: 1,
      },
    );
    await publisher.publish(loyalty);
    expect(publishedHeaders(send.mock.calls[0]?.[0])['event-schema-id']).toBe(
      LoyaltyEventSchemaCatalog.LoyaltyTierRuleProjected.schemaId,
    );

    send.mockClear();
    await publisher.publish(event());
    expect(
      publishedHeaders(send.mock.calls[0]?.[0])['event-schema-id'],
    ).toBeUndefined();
    await publisher.disconnect();
  });
  it('allows a later attempt after failed connect and redacts the raw failure', async () => {
    connect.mockRejectedValueOnce(new Error('secret-password-and-broker'));
    const publisher = new KafkaEventPublisher();
    await expect(publisher.publish(event())).rejects.toThrow(
      'Kafka delivery failed',
    );
    await expect(publisher.publish(event())).resolves.toBe(true);
    expect(connect).toHaveBeenCalledTimes(2);
    await publisher.disconnect();
  });
  it('propagates send failure without exposing raw errors', async () => {
    send.mockRejectedValueOnce(new Error('secret-password'));
    const publisher = new KafkaEventPublisher();
    await expect(publisher.publish(event())).rejects.toThrow(
      /^Kafka delivery failed$/,
    );
    disconnect.mockRejectedValueOnce(new Error('secret-password'));
    await expect(publisher.disconnect()).rejects.toThrow(
      /^Kafka disconnect failed$/,
    );
  });
  it('rejects invalid envelopes before connecting', async () => {
    const publisher = new KafkaEventPublisher();
    await expect(
      publisher.publish({ ...event(), eventId: 'bad' }),
    ).rejects.toThrow('Invalid canonical event');
    expect(connect).not.toHaveBeenCalled();
    await publisher.disconnect();
  });
  it('drains in-flight work before disconnecting and rejects new work', async () => {
    let release!: () => void;
    connect.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const publisher = new KafkaEventPublisher();
    const pending = publisher.publish(event());
    const stopping = publisher.disconnect();
    expect(disconnect).not.toHaveBeenCalled();
    await expect(publisher.publish(event())).rejects.toThrow('stopping');
    release();
    await pending;
    await stopping;
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
