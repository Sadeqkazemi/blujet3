import { Kafka } from 'kafkajs';
import { KafkaEventPublisher } from './kafka-event-publisher';
import { CanonicalEventType, createCanonicalEvent } from './canonical-events';

jest.mock('kafkajs', () => ({ Kafka: jest.fn(), logLevel: { NOTHING: 0 } }));

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
        retry: { retries: 0 },
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
