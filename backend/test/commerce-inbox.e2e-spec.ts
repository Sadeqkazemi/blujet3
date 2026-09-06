import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { CommerceInboxReceipt } from '../src/database/entities/commerce-inbox-receipt.entity';
import { CommerceOutboxEvent } from '../src/database/entities/commerce-outbox-event.entity';
import { CommerceInbox1791648000000 } from '../src/database/migrations/1791648000000-CommerceInbox';
import { CommerceInboxService } from '../src/modules/commerce-inbox/commerce-inbox.service';
import { CommerceInboxModule } from '../src/modules/commerce-inbox/commerce-inbox.module';
import { CommerceInboxKafkaHandler } from '../src/modules/commerce-inbox/commerce-inbox-kafka.handler';
import {
  createItineraryOrderCreated,
  createItineraryPaymentConfirmed,
  parseCoreItineraryEvent,
} from '../src/common/events/core-itinerary-events';
import { decryptPii } from '../src/common/pii-crypto';
import { CommerceOutboxService } from '../src/modules/commerce-outbox/commerce-outbox.service';
import {
  CanonicalEventType,
  createCanonicalEvent,
} from '../src/common/events/canonical-events';

describe('Core inbox PostgreSQL transactions', () => {
  let db: DataSource;
  let inbox: CommerceInboxService;
  const consumer = `inbox-${randomUUID()}`;
  const producer = `source-${randomUUID()}`;
  const effectProducer = `effect-${randomUUID()}`;
  const makeEvent = () =>
    createCanonicalEvent({
      eventType: CanonicalEventType.ORDER_CREATED,
      producer,
      aggregateType: 'Order',
      aggregateId: randomUUID(),
      correlationId: randomUUID(),
      idempotencyKey: randomUUID(),
      payload: { amountIrr: '10000000000000000', currency: 'IRR' },
    });
  // A fresh outbox row per invocation makes duplicate handler calls observable.
  const effect = async (manager: EntityManager) => {
    await new CommerceOutboxService().enqueue(manager, {
      ...makeEvent(),
      producer: effectProducer,
    });
  };
  const effects = () =>
    db.getRepository(CommerceOutboxEvent).countBy({ producer: effectProducer });
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) ||
      !url.pathname.endsWith('_test')
    )
      throw new Error('Inbox requires a local _test database');
    db = await new DataSource({
      ...dataSourceOptions,
      logging: false,
    }).initialize();
    inbox = new CommerceInboxService(db);
  });
  afterEach(async () => {
    await db.getRepository(CommerceInboxReceipt).delete({ consumer });
    await db
      .getRepository(CommerceInboxReceipt)
      .delete({ consumer: `${consumer}-other` });
    await db
      .getRepository(CommerceOutboxEvent)
      .delete({ producer: effectProducer });
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  it('persists one receipt/effect and deduplicates across service instances', async () => {
    const event = makeEvent();
    expect(await inbox.consume(consumer, producer, event, effect)).toBe(
      'processed',
    );
    const receipt = await db
      .getRepository(CommerceInboxReceipt)
      .findOneByOrFail({ consumer, eventId: event.eventId });
    expect(
      await new CommerceInboxService(db).consume(
        consumer,
        producer,
        {
          ...event,
          payload: { currency: 'IRR', amountIrr: '10000000000000000' },
        },
        effect,
      ),
    ).toBe('duplicate');
    expect(await effects()).toBe(1);
    expect(
      await db
        .getRepository(CommerceInboxReceipt)
        .findOneByOrFail({ consumer, eventId: event.eventId }),
    ).toEqual(receipt);
  });
  it('serializes concurrent deliveries to one handler effect', async () => {
    const event = makeEvent();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        new CommerceInboxService(db).consume(consumer, producer, event, effect),
      ),
    );
    expect(results.filter((value) => value === 'processed')).toHaveLength(1);
    expect(results.filter((value) => value === 'duplicate')).toHaveLength(7);
    expect(await effects()).toBe(1);
  });
  it('wires the Nest module and commits through the exported service', async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...dataSourceOptions, logging: false }),
        CommerceInboxModule,
      ],
    }).compile();
    try {
      await module.init();
      expect(module.get(CommerceInboxKafkaHandler)).toBeInstanceOf(
        CommerceInboxKafkaHandler,
      );
      expect(
        await module
          .get(CommerceInboxService)
          .consume(consumer, producer, makeEvent(), effect),
      ).toBe('processed');
      expect(await effects()).toBe(1);
    } finally {
      await module.close();
    }
  });
  it('rolls back receipt and handler writes then allows retry', async () => {
    const event = makeEvent();
    await expect(
      inbox.consume(consumer, producer, event, async (manager) => {
        await effect(manager);
        throw new Error('fixture failure');
      }),
    ).rejects.toThrow('fixture failure');
    expect(await effects()).toBe(0);
    expect(
      await db.getRepository(CommerceInboxReceipt).countBy({ consumer }),
    ).toBe(0);
    expect(await inbox.consume(consumer, producer, event, effect)).toBe(
      'processed',
    );
    expect(await effects()).toBe(1);
  });
  it('rejects changed payload and metadata but isolates distinct consumers', async () => {
    const event = makeEvent();
    await inbox.consume(consumer, producer, event, effect);
    for (const changed of [
      { ...event, payload: { amountIrr: '2' } },
      { ...event, correlationId: 'changed' },
    ])
      await expect(
        inbox.consume(consumer, producer, changed, effect),
      ).rejects.toBeInstanceOf(ConflictException);
    expect(await effects()).toBe(1);
    expect(
      await inbox.consume(`${consumer}-other`, producer, event, effect),
    ).toBe('processed');
    expect(await effects()).toBe(2);
  });
  it('times out a held event lock without effects and permits retry', async () => {
    const event = makeEvent();
    const runner = db.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [
          JSON.stringify([
            'commerce-inbox',
            consumer,
            event.eventId.toLowerCase(),
          ]),
        ],
      );
      await expect(
        inbox.consume(consumer, producer, event, effect),
      ).rejects.toMatchObject({ driverError: { code: '55P03' } });
      expect(await effects()).toBe(0);
      expect(
        await db.getRepository(CommerceInboxReceipt).countBy({ consumer }),
      ).toBe(0);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    expect(await inbox.consume(consumer, producer, event, effect)).toBe(
      'processed',
    );
    expect(await effects()).toBe(1);
  }, 15000);
  it.each(['OrderCreated', 'PaymentConfirmed'] as const)(
    'roundtrips typed %s through the outbox and transactional inbox',
    async (eventType) => {
      const context = {
        auditId: randomUUID(),
        correlationId: randomUUID(),
        idempotencyKey: randomUUID(),
      };
      const order = {
        id: randomUUID(),
        version: 1,
        status: 'HELD' as const,
        channel: 'SYSTEM' as const,
        currency: 'IRR' as const,
        fareIrr: 9007199254740993n,
        taxIrr: 7n,
        extrasIrr: 0n,
        totalIrr: 9007199254741000n,
        createdAt: new Date('2026-09-06T00:00:00.000Z'),
        holdExpiresAt: new Date('2026-09-06T00:15:00.000Z'),
      };
      const event =
        eventType === 'OrderCreated'
          ? createItineraryOrderCreated(order, context)
          : createItineraryPaymentConfirmed(
              { ...order, status: 'TICKETED', version: 2 },
              {
                id: randomUUID(),
                orderId: order.id,
                amountIrr: order.totalIrr,
                currency: 'IRR',
                status: 'COMPLETED',
                failureCode: null,
                updatedAt: new Date('2026-09-06T00:05:00.000Z'),
              },
              context,
            );
      const outbox = new CommerceOutboxService();
      try {
        const first = await db.transaction((manager) =>
          outbox.enqueueItinerary(manager, event),
        );
        const replay = await db.transaction((manager) =>
          outbox.enqueueItinerary(manager, { ...event, eventId: randomUUID() }),
        );
        expect(replay).toEqual(first);
        const row = await db
          .getRepository(CommerceOutboxEvent)
          .findOneByOrFail({ id: first.eventId });
        const received = parseCoreItineraryEvent(
          JSON.parse(decryptPii(row.envelopeEncrypted)) as unknown,
        );
        expect(received).toEqual(event);
        await expect(
          inbox.consumeItinerary(consumer, received, async (manager, typed) => {
            expect(manager.queryRunner?.isTransactionActive).toBe(true);
            expect(typed.eventType).toBe(eventType);
            await effect(manager);
            throw new Error('typed fixture rollback');
          }),
        ).rejects.toThrow('typed fixture rollback');
        expect(await effects()).toBe(0);
        expect(
          await db.getRepository(CommerceInboxReceipt).countBy({ consumer }),
        ).toBe(0);
        expect(await inbox.consumeItinerary(consumer, received, effect)).toBe(
          'processed',
        );
        expect(await inbox.consumeItinerary(consumer, received, effect)).toBe(
          'duplicate',
        );
        expect(await effects()).toBe(1);
        await expect(
          inbox.consumeItinerary(
            consumer,
            {
              ...received,
              payload: { ...received.payload, auditId: randomUUID() },
            },
            effect,
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await effects()).toBe(1);
      } finally {
        await db
          .getRepository(CommerceOutboxEvent)
          .delete({ id: event.eventId });
      }
    },
  );
  it('propagates a closed database failure without running handler', async () => {
    const closed = new DataSource(dataSourceOptions);
    let called = false;
    await expect(
      new CommerceInboxService(closed).consume(
        consumer,
        producer,
        makeEvent(),
        () => {
          called = true;
          return Promise.resolve();
        },
      ),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });
  it('matches entity schema and supports transactional migration down/up', async () => {
    const schema = await new DataSource({
      ...dataSourceOptions,
      entities: [CommerceInboxReceipt],
      migrations: [],
    }).initialize();
    try {
      expect(
        (await schema.driver.createSchemaBuilder().log()).upQueries,
      ).toEqual([]);
    } finally {
      await schema.destroy();
    }
    const runner = db.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(
        'LOCK TABLE orders.commerce_inbox_receipts IN ACCESS EXCLUSIVE MODE NOWAIT',
      );
      if (await runner.manager.getRepository(CommerceInboxReceipt).count())
        throw new Error('Refusing migration test on nonempty inbox');
      const migration = new CommerceInbox1791648000000();
      await migration.down(runner);
      await migration.up(runner);
      expect(await runner.hasTable('orders.commerce_inbox_receipts')).toBe(
        true,
      );
      await migration.down(runner);
      await migration.up(runner);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
