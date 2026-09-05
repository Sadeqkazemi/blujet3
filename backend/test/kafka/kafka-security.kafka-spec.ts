import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { connect } from 'node:tls';
import { setTimeout as delay } from 'node:timers/promises';
import { Kafka, logLevel, type Admin, type Consumer } from 'kafkajs';
import { kafkaEventsConfig } from '../../src/config/kafka-events.config';
import { KafkaEventPublisher } from '../../src/common/events/kafka-event-publisher';
import {
  CanonicalEventType,
  createCanonicalEvent,
} from '../../src/common/events/canonical-events';
import { LocalKafka } from './local-kafka';

describe('real Kafka TLS/SCRAM publisher boundary', () => {
  let broker: LocalKafka;
  let admin: Admin;
  let consumer: Consumer;
  const publishers: KafkaEventPublisher[] = [];
  const env = { ...process.env };
  const topic = `tls-test-${randomUUID()}`;
  const received = new Map<
    string,
    { value: string; key: string; correlationId: string; version: string }
  >();
  const makeEvent = () =>
    createCanonicalEvent({
      eventType: CanonicalEventType.ORDER_CREATED,
      producer: 'tls-fixture',
      aggregateType: 'Order',
      aggregateId: randomUUID(),
      correlationId: randomUUID(),
      idempotencyKey: randomUUID(),
      payload: { amountIrr: '10000000000000000', fixture: true },
    });

  function configure(overrides: Record<string, string> = {}): void {
    if (!broker.security) throw new Error('Missing secure fixture');
    for (const key of Object.keys(process.env))
      if (key.startsWith('KAFKA_') && !key.startsWith('KAFKA_TEST_'))
        delete process.env[key];
    Object.assign(process.env, {
      // Only the config/publisher is instantiated; no production AppModule/DB.
      NODE_ENV: 'production',
      KAFKA_EVENTS_ENABLED: 'true',
      KAFKA_BROKERS: `127.0.0.1:${broker.port}`,
      KAFKA_EVENTS_TOPIC: topic,
      KAFKA_TLS_ENABLED: 'true',
      KAFKA_TLS_CA_PEM: broker.security.ca,
      KAFKA_SASL_MECHANISM: 'scram-sha-256',
      KAFKA_SASL_USERNAME: broker.security.username,
      KAFKA_SASL_PASSWORD: broker.security.password,
      ...overrides,
    });
  }

  function publisher(
    overrides: Record<string, string> = {},
  ): KafkaEventPublisher {
    configure(overrides);
    const instance = new KafkaEventPublisher();
    publishers.push(instance);
    return instance;
  }

  async function deliver(instance: KafkaEventPublisher): Promise<void> {
    const event = makeEvent();
    expect(await instance.publish(event)).toBe(true);
    const deadline = Date.now() + 20000;
    while (!received.has(event.eventId) && Date.now() < deadline)
      await delay(100);
    expect(received.get(event.eventId)).toEqual({
      value: JSON.stringify(event),
      key: `tls-fixture:Order:${event.aggregateId}`,
      correlationId: event.correlationId,
      version: '1',
    });
    await instance.disconnect();
  }

  beforeAll(async () => {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0')
      throw new Error('TLS verification must be enabled for secure tests');
    broker = await LocalKafka.create(true);
    await broker.start();
    configure();
    const config = kafkaEventsConfig();
    if (!config.enabled) throw new Error('Expected enabled Kafka');
    const client = new Kafka({
      ...config.client,
      logLevel: logLevel.NOTHING,
      retry: { retries: 5 },
    });
    admin = client.admin();
    await admin.connect();
    await admin.createTopics({
      topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
      waitForLeaders: true,
    });
    consumer = client.consumer({
      groupId: `tls-${randomUUID()}`,
      allowAutoTopicCreation: false,
    });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    await consumer.run({
      eachMessage: ({ message }) => {
        received.set(message.headers?.['event-id']?.toString() ?? '', {
          value: message.value?.toString() ?? '',
          key: message.key?.toString() ?? '',
          correlationId: message.headers?.['correlation-id']?.toString() ?? '',
          version: message.headers?.['event-version']?.toString() ?? '',
        });
        return Promise.resolve();
      },
    });
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      for (const cleanup of [
        ...publishers.map((instance) => () => instance.disconnect()),
        () => consumer?.disconnect(),
        () => admin?.disconnect(),
        () => broker?.stop(),
        () => broker?.security?.cleanup(),
      ]) {
        try {
          await cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      if (broker?.security) {
        for (const name of ['broker.p12', 'server.properties'])
          await expect(
            access(join(broker.directory, name)),
          ).rejects.toMatchObject({ code: 'ENOENT' });
      }
    } finally {
      process.env = env;
    }
    if (errors.length)
      throw new AggregateError(errors, 'Secure Kafka cleanup failed');
  });

  it.each(['scram-sha-256', 'scram-sha-512'])(
    'delivers exact envelope with TLS / %s',
    async (mechanism) => {
      await deliver(publisher({ KAFKA_SASL_MECHANISM: mechanism }));
    },
  );

  it.each([
    ['wrong password', { KAFKA_SASL_PASSWORD: `wrong-${randomUUID()}` }],
    ['unknown user', { KAFKA_SASL_USERNAME: `unknown-${randomUUID()}` }],
    ['untrusted certificate', { KAFKA_TLS_CA_PEM: '' }],
  ] as const)(
    'rejects %s without a record or secret disclosure',
    async (_name, overrides) => {
      const before = await admin.fetchTopicOffsets(topic);
      const instance = publisher(overrides);
      const failure: unknown = await instance
        .publish(makeEvent())
        .catch((error: unknown) => error);
      // Boolean assertions cannot print unexpected raw errors/fixture credentials.
      expect(
        failure instanceof Error &&
          failure.message === 'Kafka delivery failed' &&
          failure.cause === undefined,
      ).toBe(true);
      await instance.disconnect();
      expect(await admin.fetchTopicOffsets(topic)).toEqual(before);
      // An authenticated control delivery proves rejection was not broker downtime.
      await deliver(publisher());
    },
  );

  it('rejects a trusted certificate with the wrong TLS hostname', async () => {
    const code = await new Promise<string>((resolve) => {
      const socket = connect({
        host: '127.0.0.1',
        port: broker.port,
        servername: 'wrong.invalid',
        ca: broker.security!.ca,
        rejectUnauthorized: true,
      });
      const finish = (result: string) => {
        socket.destroy();
        resolve(result);
      };
      socket.once('secureConnect', () => finish('UNEXPECTED_CONNECTION'));
      socket.once('error', (error: NodeJS.ErrnoException) =>
        finish(error.code ?? 'UNKNOWN'),
      );
      socket.setTimeout(5000, () => finish('TIMEOUT'));
    });
    expect(code).toBe('ERR_TLS_CERT_ALTNAME_INVALID');
    await deliver(publisher());
  });
});
