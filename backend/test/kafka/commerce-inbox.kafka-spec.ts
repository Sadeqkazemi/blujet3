import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  Kafka,
  logLevel,
  type Admin,
  type Consumer,
  type Producer,
} from 'kafkajs';
import { DataSource, type EntityManager } from 'typeorm';
import { dataSourceOptions } from '../../src/database/data-source.options';
import { CommerceInboxReceipt } from '../../src/database/entities/commerce-inbox-receipt.entity';
import { CommerceOutboxEvent } from '../../src/database/entities/commerce-outbox-event.entity';
import { CommerceInboxService } from '../../src/modules/commerce-inbox/commerce-inbox.service';
import {
  CommerceInboxKafkaHandler,
  type CommerceInboxKafkaApply,
} from '../../src/modules/commerce-inbox/commerce-inbox-kafka.handler';
import { CommerceOutboxService } from '../../src/modules/commerce-outbox/commerce-outbox.service';
import {
  createCanonicalEvent,
  CanonicalEventType,
  type CanonicalEvent,
} from '../../src/common/events/canonical-events';
import { LocalKafka } from './local-kafka';

describe('Kafka manual acknowledgement with real Core inbox', () => {
  let broker: LocalKafka;
  let db: DataSource;
  let kafka: Kafka;
  let admin: Admin;
  let publisher: Producer;
  let adapter: CommerceInboxKafkaHandler;
  const consumers: Consumer[] = [];
  const source = 'core-fixture-' + randomUUID();
  const effectProducer = 'inbox-effect-' + randomUUID();
  let topic: string;
  let group: string;
  const identities: string[] = [];
  const event = () =>
    createCanonicalEvent({
      eventType: CanonicalEventType.ORDER_CREATED,
      producer: source,
      aggregateType: 'Order',
      aggregateId: randomUUID(),
      correlationId: randomUUID(),
      idempotencyKey: randomUUID(),
      payload: { fixture: true, amountIrr: '1000' },
    });
  const effect = async (manager: EntityManager) => {
    await new CommerceOutboxService().enqueue(manager, {
      ...event(),
      producer: effectProducer,
    });
  };
  const effectCount = () =>
    db.getRepository(CommerceOutboxEvent).countBy({ producer: effectProducer });
  const receiptCount = () =>
    db.getRepository(CommerceInboxReceipt).countBy({ consumer: group });
  const offset = async () => {
    const offsets = await admin.fetchOffsets({
      groupId: group,
      topics: [topic],
    });
    return offsets[0]?.partitions[0]?.offset ?? '-1';
  };
  async function until(check: () => Promise<boolean>) {
    const deadline = Date.now() + 20000;
    while (!(await check())) {
      if (Date.now() > deadline)
        throw new Error('Kafka inbox fixture timed out');
      await delay(50);
    }
  }
  async function send(value: CanonicalEvent) {
    await publisher.send({
      topic,
      acks: -1,
      messages: [
        {
          key: `${value.producer}:${value.aggregateType}:${value.aggregateId}`,
          value: JSON.stringify(value),
          headers: {
            'event-id': value.eventId,
            'correlation-id': value.correlationId,
            'event-version': '1',
          },
        },
      ],
    });
  }
  async function start(
    apply: CommerceInboxKafkaApply,
    commit?: Consumer['commitOffsets'],
  ) {
    const client = kafka.consumer({
      groupId: group,
      allowAutoTopicCreation: false,
      retry: { retries: 5, restartOnFailure: () => Promise.resolve(false) },
    });
    consumers.push(client);
    await client.connect();
    await client.subscribe({ topic, fromBeginning: true });
    await client.run(
      adapter.runConfig(
        {
          commitOffsets: commit ?? ((offsets) => client.commitOffsets(offsets)),
        },
        { topic, consumer: group, expectedProducer: source },
        apply,
      ),
    );
    return client;
  }
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.endsWith('_test')
    )
      throw new Error('Only loopback PostgreSQL _test is allowed');
    db = await new DataSource({
      ...dataSourceOptions,
      logging: false,
    }).initialize();
    await db.runMigrations();
    adapter = new CommerceInboxKafkaHandler(new CommerceInboxService(db));
    broker = await LocalKafka.create();
    await broker.start();
    kafka = new Kafka({
      brokers: [`127.0.0.1:${broker.port}`],
      clientId: source,
      logLevel: logLevel.NOTHING,
    });
    admin = kafka.admin();
    publisher = kafka.producer({ allowAutoTopicCreation: false });
    await admin.connect();
    await publisher.connect();
  });
  beforeEach(async () => {
    topic = 'inbox-' + randomUUID();
    group = 'core-reader-' + randomUUID();
    identities.push(group);
    await admin.createTopics({
      topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
      waitForLeaders: true,
    });
  });
  afterEach(async () => {
    for (const client of consumers.splice(0)) {
      await client.stop();
      await client.disconnect();
    }
    if (db?.isInitialized) {
      for (const consumer of identities.splice(0))
        await db.getRepository(CommerceInboxReceipt).delete({ consumer });
      await db
        .getRepository(CommerceOutboxEvent)
        .delete({ producer: effectProducer });
    }
  });
  afterAll(async () => {
    const results = await Promise.allSettled([
      publisher?.disconnect(),
      admin?.disconnect(),
      db?.isInitialized ? db.destroy() : Promise.resolve(),
    ]);
    await broker?.stop();
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('Kafka inbox fixture cleanup failed');
  });
  it('never commits group offset or exposes effects before the DB commit', async () => {
    let entered = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await start(async (manager) => {
        expect(manager.queryRunner?.isTransactionActive).toBe(true);
        await effect(manager);
        entered = true;
        await gate;
      });
      await send(event());
      await until(() => Promise.resolve(entered));
      expect(await receiptCount()).toBe(0);
      expect(await effectCount()).toBe(0);
      expect(BigInt(await offset())).toBeLessThan(1n);
      release();
      await until(async () => (await offset()) === '1');
      expect(await receiptCount()).toBe(1);
      expect(await effectCount()).toBe(1);
    } finally {
      release();
    }
  });
  it('replays the same group after injected ACK failure without a second effect', async () => {
    let ackFailed = false;
    const first = await start(effect, () => {
      ackFailed = true;
      return Promise.reject(new Error('fixture lost offset acknowledgement'));
    });
    await send(event());
    await until(() => Promise.resolve(ackFailed));
    await first.stop();
    await first.disconnect();
    expect(await receiptCount()).toBe(1);
    expect(await effectCount()).toBe(1);
    expect(BigInt(await offset())).toBeLessThan(1n);
    let calls = 0;
    await start(async (manager) => {
      calls++;
      await effect(manager);
    });
    await until(async () => (await offset()) === '1');
    expect(calls).toBe(0);
    expect(await effectCount()).toBe(1);
    await send(event());
    await until(async () => (await offset()) === '2');
    expect(calls).toBe(1);
    expect(await receiptCount()).toBe(2);
    expect(await effectCount()).toBe(2);
  });
  it('rolls back handler writes and leaves offset retryable on failure', async () => {
    let failed = false;
    const first = await start(async (manager) => {
      await effect(manager);
      failed = true;
      throw new Error('fixture handler failure');
    });
    await send(event());
    await until(() => Promise.resolve(failed));
    await first.stop();
    await first.disconnect();
    expect(await receiptCount()).toBe(0);
    expect(await effectCount()).toBe(0);
    expect(BigInt(await offset())).toBeLessThan(1n);
    await start(effect);
    await until(async () => (await offset()) === '1');
    expect(await receiptCount()).toBe(1);
    expect(await effectCount()).toBe(1);
  });
});
