import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Kafka, logLevel, type Admin, type Consumer } from 'kafkajs';
import { Logger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../../src/database/data-source.options';
import { CommerceOutboxEvent } from '../../src/database/entities/commerce-outbox-event.entity';
import { CommerceOutboxService } from '../../src/modules/commerce-outbox/commerce-outbox.service';
import { CommerceOutboxDispatcher } from '../../src/modules/commerce-outbox/commerce-outbox.dispatcher';
import { KafkaEventPublisher } from '../../src/common/events/kafka-event-publisher';
import {
  CanonicalEventType,
  createCanonicalEvent,
  type CanonicalEvent,
} from '../../src/common/events/canonical-events';
import { LocalKafka } from './local-kafka';

describe('real Kafka / PostgreSQL outbox boundary', () => {
  let broker: LocalKafka;
  let db: DataSource;
  let admin: Admin;
  let consumer: Consumer;
  let publisher: KafkaEventPublisher;
  let dispatcher: CommerceOutboxDispatcher;
  let interruptedDb: DataSource;
  const extraDispatchers: CommerceOutboxDispatcher[] = [];
  const env = { ...process.env };
  const producer = `broker-test-${randomUUID()}`;
  const topic = `blujet-test-${randomUUID()}`;
  const received: {
    offset: string;
    value: string;
    key: string;
    eventId: string;
    correlationId: string;
  }[] = [];
  const outbox = new CommerceOutboxService();
  const makeEvent = () =>
    createCanonicalEvent({
      eventType: CanonicalEventType.ORDER_CREATED,
      producer,
      aggregateType: 'Order',
      aggregateId: randomUUID(),
      correlationId: randomUUID(),
      idempotencyKey: randomUUID(),
      payload: { amountIrr: '10000000000000000', fixture: true },
    });
  const row = (id: string) =>
    db.getRepository(CommerceOutboxEvent).findOneByOrFail({ id });
  async function consumeEvent(eventId: string) {
    const deadline = Date.now() + 20000;
    while (
      !received.some((event) => event.eventId === eventId) &&
      Date.now() < deadline
    )
      await delay(100);
    const event = received.find((entry) => entry.eventId === eventId);
    expect(event).toBeDefined();
    return event!;
  }
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.endsWith('_test')
    )
      throw new Error('Kafka tests require loopback PostgreSQL _test database');
    broker = await LocalKafka.create();
    await broker.start();
    db = await new DataSource({
      ...dataSourceOptions,
      logging: false,
      extra: { options: '-c timezone=UTC' },
    }).initialize();
    await db.runMigrations();
    if (await db.getRepository(CommerceOutboxEvent).count())
      throw new Error('Refusing to dispatch pre-existing outbox work');
    for (const key of Object.keys(process.env))
      if (key.startsWith('KAFKA_') && !key.startsWith('KAFKA_TEST_'))
        delete process.env[key];
    Object.assign(process.env, {
      NODE_ENV: 'test',
      KAFKA_EVENTS_ENABLED: 'true',
      KAFKA_BROKERS: `127.0.0.1:${broker.port}`,
      KAFKA_EVENTS_TOPIC: topic,
      KAFKA_TLS_ENABLED: 'false',
    });
    const client = new Kafka({
      clientId: 'blujet-broker-test',
      brokers: [`127.0.0.1:${broker.port}`],
      logLevel: logLevel.NOTHING,
      retry: { retries: 5 },
      requestTimeout: 5000,
    });
    admin = client.admin();
    await admin.connect();
    await admin.createTopics({
      topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
      waitForLeaders: true,
    });
    consumer = client.consumer({
      groupId: `test-${randomUUID()}`,
      allowAutoTopicCreation: false,
    });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    await consumer.run({
      eachMessage: ({ message }) => {
        received.push({
          offset: message.offset,
          value: message.value?.toString() ?? '',
          key: message.key?.toString() ?? '',
          eventId: message.headers?.['event-id']?.toString() ?? '',
          correlationId: message.headers?.['correlation-id']?.toString() ?? '',
        });
        return Promise.resolve();
      },
    });
    publisher = new KafkaEventPublisher();
    dispatcher = new CommerceOutboxDispatcher(db, publisher, {
      warn: () => undefined,
      error: () => undefined,
    } as unknown as Logger);
  });
  afterAll(async () => {
    // No topic deletion: disposable broker logs remain for inspection.
    const errors: unknown[] = [];
    try {
      for (const cleanup of [
        () => dispatcher?.onApplicationShutdown(),
        ...extraDispatchers.map(
          (worker) => () => worker.onApplicationShutdown(),
        ),
        () =>
          interruptedDb?.isInitialized ? interruptedDb.destroy() : undefined,
        () => consumer?.disconnect(),
        () => admin?.disconnect(),
        () => broker?.stop(),
        () =>
          db?.isInitialized
            ? db.getRepository(CommerceOutboxEvent).delete({ producer })
            : undefined,
        () => (db?.isInitialized ? db.destroy() : undefined),
      ]) {
        try {
          await cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
    } finally {
      process.env = env;
    }
    if (errors.length)
      throw new AggregateError(errors, 'Kafka test cleanup failed');
  });
  it('commits an encrypted event, delivers exact envelope and waits for broker ACK', async () => {
    const event = makeEvent();
    await db.transaction((manager) => outbox.enqueue(manager, event));
    expect((await row(event.eventId)).deliveredAt).toBeNull();
    await dispatcher.drainOnce();
    expect(await consumeEvent(event.eventId)).toEqual({
      offset: '0',
      value: JSON.stringify(event),
      key: `${producer}:Order:${event.aggregateId}`,
      eventId: event.eventId,
      correlationId: event.correlationId,
    });
    expect((await row(event.eventId)).deliveredAt).toBeInstanceOf(Date);
    await dispatcher.drainOnce();
    const offsets = await admin.fetchTopicOffsets(topic);
    expect(offsets[0].high).toBe('1');
  });
  it('rollback cannot publish a phantom record', async () => {
    const event = makeEvent();
    await expect(
      db.transaction(async (manager) => {
        await outbox.enqueue(manager, event);
        throw new Error('rollback fixture');
      }),
    ).rejects.toThrow('rollback fixture');
    await dispatcher.drainOnce();
    expect(
      await db
        .getRepository(CommerceOutboxEvent)
        .findOneBy({ id: event.eventId }),
    ).toBeNull();
    expect((await admin.fetchTopicOffsets(topic))[0].high).toBe('1');
  });
  it('retains work during a real broker crash and delivers the same ID after restart', async () => {
    await consumer.disconnect();
    await admin.disconnect();
    await broker.stop();
    const event = makeEvent();
    await db.transaction((manager) => outbox.enqueue(manager, event));
    await dispatcher.drainOnce();
    expect(await row(event.eventId)).toMatchObject({
      deliveredAt: null,
      deadLetterAt: null,
      attempts: 1,
      lastError: 'KAFKA_DELIVERY_FAILED',
    });
    await broker.start();
    await admin.connect();
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });
    await consumer.run({
      eachMessage: ({ message }) => {
        received.push({
          offset: message.offset,
          value: message.value?.toString() ?? '',
          key: message.key?.toString() ?? '',
          eventId: message.headers?.['event-id']?.toString() ?? '',
          correlationId: message.headers?.['correlation-id']?.toString() ?? '',
        });
        return Promise.resolve();
      },
    });
    const deadline = Date.now() + 25000;
    while (!(await row(event.eventId)).deliveredAt && Date.now() < deadline) {
      await db
        .getRepository(CommerceOutboxEvent)
        .update(event.eventId, { nextAttemptAt: new Date(0) });
      await dispatcher.drainOnce();
      if (!(await row(event.eventId)).deliveredAt) await delay(500);
    }
    expect((await row(event.eventId)).deliveredAt).toBeInstanceOf(Date);
    const recovered = await consumeEvent(event.eventId);
    expect(JSON.parse(recovered.value)).toEqual(event);
    expect((await admin.fetchTopicOffsets(topic))[0].high).toBe('2');
  });

  it('recovers the same event after Kafka ACK but before database acknowledgement', async () => {
    const event = makeEvent();
    const beforeOffset = BigInt((await admin.fetchTopicOffsets(topic))[0].high);
    await db.transaction((manager) => outbox.enqueue(manager, event));
    const original = await row(event.eventId);
    interruptedDb = await new DataSource({
      ...dataSourceOptions,
      logging: false,
      extra: { options: '-c timezone=UTC' },
    }).initialize();
    let brokerAcknowledged = false;
    class DisconnectAfterAckPublisher extends KafkaEventPublisher {
      override async publish(envelope: CanonicalEvent): Promise<boolean> {
        const sent = await super.publish(envelope);
        if (sent) {
          brokerAcknowledged = true;
          // Real broker ACK, then loss of only this worker's connection pool.
          await interruptedDb.destroy();
        }
        return sent;
      }
    }
    const logger = {
      warn: () => undefined,
      error: () => undefined,
    } as unknown as Logger;
    const interrupted = new CommerceOutboxDispatcher(
      interruptedDb,
      new DisconnectAfterAckPublisher(),
      logger,
    );
    extraDispatchers.push(interrupted);
    const failure: unknown = await interrupted
      .drainOnce()
      .catch((error: unknown) => error);
    expect(failure instanceof Error).toBe(true);
    expect(brokerAcknowledged).toBe(true);
    expect(interruptedDb.isInitialized).toBe(false);
    const leased = await row(event.eventId);
    expect(leased).toMatchObject({
      deliveredAt: null,
      deadLetterAt: null,
      attempts: 1,
      envelopeEncrypted: original.envelopeEncrypted,
    });
    expect(leased.claimedAt).toBeInstanceOf(Date);
    expect(typeof leased.claimToken).toBe('string');
    expect((await admin.fetchTopicOffsets(topic))[0].high).toBe(
      String(beforeOffset + 1n),
    );
    await consumeEvent(event.eventId);
    await interrupted.onApplicationShutdown();

    const replacement = new CommerceOutboxDispatcher(
      db,
      new KafkaEventPublisher(),
      logger,
    );
    extraDispatchers.push(replacement);
    await replacement.drainOnce();
    expect(await row(event.eventId)).toMatchObject({
      attempts: 1,
      claimToken: leased.claimToken,
      deliveredAt: null,
    });
    expect((await admin.fetchTopicOffsets(topic))[0].high).toBe(
      String(beforeOffset + 1n),
    );

    const aged = await db
      .getRepository(CommerceOutboxEvent)
      .update(
        { id: event.eventId, producer, claimToken: leased.claimToken! },
        { claimedAt: new Date(0) },
      );
    expect(aged.affected).toBe(1);
    await replacement.drainOnce();
    const recovered = await row(event.eventId);
    expect(recovered).toMatchObject({
      attempts: 2,
      claimedAt: null,
      claimToken: null,
      deadLetterAt: null,
      lastError: null,
      envelopeEncrypted: original.envelopeEncrypted,
    });
    expect(recovered.deliveredAt).toBeInstanceOf(Date);
    expect((await admin.fetchTopicOffsets(topic))[0].high).toBe(
      String(beforeOffset + 2n),
    );
    const deliveries = () =>
      new Map(
        received
          .filter((entry) => entry.eventId === event.eventId)
          .map((entry) => [entry.offset, entry]),
      );
    const deadline = Date.now() + 20000;
    while (deliveries().size < 2 && Date.now() < deadline) await delay(100);
    expect([...deliveries().keys()].sort()).toEqual(
      [String(beforeOffset), String(beforeOffset + 1n)].sort(),
    );
    for (const entry of deliveries().values()) {
      expect(entry.value).toBe(JSON.stringify(event));
      expect(entry.key).toBe(`${producer}:Order:${event.aggregateId}`);
      expect(entry.correlationId).toBe(event.correlationId);
    }
    await replacement.drainOnce();
    expect((await admin.fetchTopicOffsets(topic))[0].high).toBe(
      String(beforeOffset + 2n),
    );
    expect((await row(event.eventId)).attempts).toBe(2);
  });
});
