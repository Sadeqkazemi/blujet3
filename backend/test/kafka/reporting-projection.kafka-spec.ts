import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  Kafka,
  logLevel,
  type Admin,
  type Consumer,
  type Producer,
} from 'kafkajs';
import { DataSource, In } from 'typeorm';
import { createItineraryOrderCreated } from '../../src/common/events/core-itinerary-events';
import { dataSourceOptions } from '../../src/database/data-source.options';
import { ReportingItineraryEventProjection } from '../../src/database/entities/reporting-itinerary-event-projection.entity';
import { ReportingItineraryEventReceipt } from '../../src/database/entities/reporting-itinerary-event-receipt.entity';
import { ReportingKafkaConsumerCheckpoint } from '../../src/database/entities/reporting-kafka-consumer-checkpoint.entity';
import { ReportingEventConsumer } from '../../src/modules/reporting/reporting-event-consumer';
import { ReportingItineraryProjectionStore } from '../../src/modules/reporting/reporting-itinerary-projection.store';
import { ReportingKafkaHandler } from '../../src/modules/reporting/reporting-kafka.handler';
import {
  ReportingKafkaRuntime,
  type ReportingKafkaRuntimeClient,
} from '../../src/modules/reporting/reporting-kafka.runtime';
import { LocalKafka } from './local-kafka';

describe('Reporting projection with real Kafka acknowledgement', () => {
  let broker: LocalKafka;
  let db: DataSource;
  let kafka: Kafka;
  let admin: Admin;
  let publisher: Producer;
  let adapter: ReportingKafkaHandler;
  let topic: string;
  let group: string;
  const runtimes: ReportingKafkaRuntime[] = [];
  const orderIds = new Set<string>();

  const event = () => {
    const orderId = `reporting-kafka-${randomUUID()}`;
    orderIds.add(orderId);
    return createItineraryOrderCreated(
      {
        id: orderId,
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
  };

  async function until(check: () => Promise<boolean>): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (!(await check())) {
      if (Date.now() > deadline)
        throw new Error('Reporting Kafka fixture timed out');
      await delay(50);
    }
  }

  async function offset(): Promise<string> {
    const offsets = await admin.fetchOffsets({
      groupId: group,
      topics: [topic],
    });
    return offsets[0]?.partitions[0]?.offset ?? '-1';
  }

  async function send(value: ReturnType<typeof event>): Promise<void> {
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
    commit?: Consumer['commitOffsets'],
  ): Promise<ReportingKafkaRuntime> {
    const client = kafka.consumer({
      groupId: group,
      allowAutoTopicCreation: false,
      retry: { retries: 5, restartOnFailure: () => Promise.resolve(false) },
    });
    const runtimeClient: ReportingKafkaRuntimeClient = {
      connect: () => client.connect(),
      subscribe: (subscription) => client.subscribe(subscription),
      run: (config) => client.run(config),
      stop: () => client.stop(),
      disconnect: () => client.disconnect(),
      commitOffsets: commit ?? ((offsets) => client.commitOffsets(offsets)),
    };
    const runtime = new ReportingKafkaRuntime(
      {
        enabled: true,
        topic,
        fromBeginning: true,
        maxBytes: 256 * 1024,
        client: { brokers: [`127.0.0.1:${broker.port}`] },
        consumer: { groupId: group },
      },
      runtimeClient,
      adapter,
      new ReportingItineraryProjectionStore(
        db.getRepository(ReportingItineraryEventProjection),
        db.getRepository(ReportingItineraryEventReceipt),
        db.getRepository(ReportingKafkaConsumerCheckpoint),
      ),
      { log: () => undefined, error: () => undefined } as never,
    );
    runtimes.push(runtime);
    await runtime.onApplicationBootstrap();
    return runtime;
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
      extra: { options: '-c timezone=UTC' },
    }).initialize();
    await db.runMigrations();
    const store = new ReportingItineraryProjectionStore(
      db.getRepository(ReportingItineraryEventProjection),
      db.getRepository(ReportingItineraryEventReceipt),
      db.getRepository(ReportingKafkaConsumerCheckpoint),
    );
    adapter = new ReportingKafkaHandler(new ReportingEventConsumer(store));
    broker = await LocalKafka.create();
    await broker.start();
    kafka = new Kafka({
      brokers: [`127.0.0.1:${broker.port}`],
      clientId: `reporting-${randomUUID()}`,
      logLevel: logLevel.NOTHING,
    });
    admin = kafka.admin();
    publisher = kafka.producer({ allowAutoTopicCreation: false });
    await admin.connect();
    await publisher.connect();
  });

  beforeEach(async () => {
    topic = `reporting-${randomUUID()}`;
    group = `reporting-reader-${randomUUID()}`;
    await admin.createTopics({
      topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
      waitForLeaders: true,
    });
  });

  afterEach(async () => {
    for (const runtime of runtimes.splice(0))
      await runtime.onApplicationShutdown();
    if (db?.isInitialized && orderIds.size) {
      const ids = [...orderIds];
      await db
        .getRepository(ReportingItineraryEventProjection)
        .delete({ orderId: In(ids) });
      await db
        .getRepository(ReportingItineraryEventReceipt)
        .delete({ orderId: In(ids) });
    }
    if (db?.isInitialized && group)
      await db
        .getRepository(ReportingKafkaConsumerCheckpoint)
        .delete({ consumerGroup: group, topic });
    orderIds.clear();
  });

  afterAll(async () => {
    const results = await Promise.allSettled([
      publisher?.disconnect(),
      admin?.disconnect(),
      db?.isInitialized ? db.destroy() : Promise.resolve(),
    ]);
    await broker?.stop();
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('Reporting Kafka fixture cleanup failed');
  });

  it('projects a typed event before committing its group offset', async () => {
    const value = event();
    await start();
    await send(value);
    await until(async () => (await offset()) === '1');
    expect(
      await db.getRepository(ReportingItineraryEventProjection).countBy({
        orderId: value.aggregateId,
      }),
    ).toBe(1);
    expect(
      await db.getRepository(ReportingItineraryEventReceipt).countBy({
        eventId: value.eventId,
      }),
    ).toBe(1);
    expect(
      await db.getRepository(ReportingKafkaConsumerCheckpoint).findOneByOrFail({
        consumerGroup: group,
        topic,
        partition: 0,
      }),
    ).toMatchObject({ nextOffset: '1' });
  });

  it('replays an ACK gap without duplicating the projection or receipt', async () => {
    const value = event();
    let acknowledgementFailed = false;
    const first = await start(() => {
      acknowledgementFailed = true;
      return Promise.reject(new Error('fixture lost acknowledgement'));
    });
    await send(value);
    await until(() => Promise.resolve(acknowledgementFailed));
    await first.onApplicationShutdown();
    expect(BigInt(await offset())).toBeLessThan(1n);
    expect(
      await db.getRepository(ReportingItineraryEventProjection).countBy({
        orderId: value.aggregateId,
      }),
    ).toBe(1);
    expect(
      await db.getRepository(ReportingItineraryEventReceipt).countBy({
        eventId: value.eventId,
      }),
    ).toBe(1);
    expect(
      await db.getRepository(ReportingKafkaConsumerCheckpoint).findOneByOrFail({
        consumerGroup: group,
        topic,
        partition: 0,
      }),
    ).toMatchObject({ nextOffset: '1' });

    await start();
    await until(async () => (await offset()) === '1');
    expect(
      await db.getRepository(ReportingItineraryEventProjection).countBy({
        orderId: value.aggregateId,
      }),
    ).toBe(1);
    expect(
      await db.getRepository(ReportingItineraryEventReceipt).countBy({
        eventId: value.eventId,
      }),
    ).toBe(1);
  });
});
