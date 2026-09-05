import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Logger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { CommerceOutboxEvent } from '../src/database/entities/commerce-outbox-event.entity';
import { CommerceOutbox1791561600000 } from '../src/database/migrations/1791561600000-CommerceOutbox';
import { CommerceOutboxService } from '../src/modules/commerce-outbox/commerce-outbox.service';
import { CommerceOutboxModule } from '../src/modules/commerce-outbox/commerce-outbox.module';
import { CommerceOutboxDispatcher } from '../src/modules/commerce-outbox/commerce-outbox.dispatcher';
import { KafkaEventPublisher } from '../src/common/events/kafka-event-publisher';
import {
  CanonicalEventType,
  createCanonicalEvent,
  type CanonicalEvent,
} from '../src/common/events/canonical-events';
import { decryptPii } from '../src/common/pii-crypto';

// Real PostgreSQL transactions/locks; Kafka is deliberately a boundary double.
describe('Commerce outbox (PostgreSQL)', () => {
  let db: DataSource;
  const service = new CommerceOutboxService();
  const producer = `outbox-test-${randomUUID()}`;
  const publish = jest.fn<Promise<boolean>, [CanonicalEvent]>();
  const enabled = jest.fn<boolean, []>();
  const disconnect = jest.fn<Promise<void>, []>();
  const transport = {
    enabled,
    publish,
    disconnect,
  } as unknown as KafkaEventPublisher;
  const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
  const worker = () => new CommerceOutboxDispatcher(db, transport, logger);
  const event = () =>
    createCanonicalEvent({
      eventType: CanonicalEventType.ORDER_CREATED,
      producer,
      aggregateType: 'Order',
      aggregateId: randomUUID(),
      correlationId: randomUUID(),
      idempotencyKey: randomUUID(),
      payload: { amountIrr: '12345678901234567890' },
    });
  const enqueue = (value: CanonicalEvent) =>
    db.transaction((manager) => service.enqueue(manager, value));
  const row = (id: string) =>
    db.getRepository(CommerceOutboxEvent).findOneByOrFail({ id });

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) ||
      !url.pathname.endsWith('_test')
    )
      throw new Error('Outbox tests require a local test database');
    db = await new DataSource({
      ...dataSourceOptions,
      logging: false,
    }).initialize();
  });
  beforeEach(async () => {
    // Never deliver or erase pre-existing pending work in a shared test DB.
    expect(await db.getRepository(CommerceOutboxEvent).count()).toBe(0);
    publish.mockReset().mockResolvedValue(true);
    enabled.mockReset().mockReturnValue(true);
    disconnect.mockReset().mockResolvedValue(undefined);
  });
  afterEach(async () => {
    if (db?.isInitialized)
      await db.getRepository(CommerceOutboxEvent).delete({ producer });
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it('requires a transaction and rejects invalid input', async () => {
    await expect(service.enqueue(db.manager, event())).rejects.toThrow(
      'active Core transaction',
    );
    await expect(
      enqueue({ ...event(), eventId: 'invalid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await db.getRepository(CommerceOutboxEvent).count()).toBe(0);
  });

  it('wires the Nest module and shuts down without connecting while disabled', async () => {
    enabled.mockReturnValue(false);
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...dataSourceOptions, logging: false }),
        CommerceOutboxModule,
      ],
    })
      .overrideProvider(KafkaEventPublisher)
      .useValue(transport)
      .useMocker((token) => (token === Logger ? logger : undefined))
      .compile();
    try {
      await module.init();
      expect(module.get(CommerceOutboxService)).toBeInstanceOf(
        CommerceOutboxService,
      );
      expect(publish).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('waits for in-flight delivery on shutdown and stops polling', async () => {
    const value = event();
    await enqueue(value);
    let release!: (sent: boolean) => void;
    let started!: () => void;
    const sending = new Promise<void>((resolve) => {
      started = resolve;
    });
    publish.mockImplementationOnce(() => {
      started();
      return new Promise<boolean>((resolve) => {
        release = resolve;
      });
    });
    const dispatcher = worker();
    const pending = dispatcher.drainOnce();
    await sending;
    const stopping = dispatcher.onApplicationShutdown();
    expect(disconnect).not.toHaveBeenCalled();
    release(true);
    await pending;
    await stopping;
    await dispatcher.drainOnce();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect((await row(value.eventId)).deliveredAt).toBeInstanceOf(Date);
  });
  it('rolls back atomically and stores a committed envelope encrypted', async () => {
    const value = event();
    await expect(
      db.transaction(async (manager) => {
        await service.enqueue(manager, value);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await db.getRepository(CommerceOutboxEvent).count()).toBe(0);
    await enqueue(value);
    const stored = await row(value.eventId);
    expect(stored.envelopeEncrypted).not.toContain(value.aggregateId);
    expect(JSON.parse(decryptPii(stored.envelopeEncrypted))).toEqual(value);
    expect(stored.deliveredAt).toBeNull();
    expect(publish).not.toHaveBeenCalled();
  });
  it('serializes concurrent semantic retries and rejects changed payloads', async () => {
    const first = event();
    const retry = {
      ...first,
      eventId: randomUUID(),
      correlationId: randomUUID(),
      occurredAt: new Date(Date.now() + 1000).toISOString(),
    };
    const results = await Promise.all([enqueue(first), enqueue(retry)]);
    expect(results[0]).toEqual(results[1]);
    expect(await db.getRepository(CommerceOutboxEvent).count()).toBe(1);
    await expect(
      enqueue({ ...retry, payload: { amountIrr: '1' } }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('does not poll the DB while disabled, including startup', async () => {
    enabled.mockReturnValue(false);
    const transaction = jest.spyOn(db, 'transaction');
    const dispatcher = worker();
    dispatcher.onApplicationBootstrap();
    await dispatcher.drainOnce();
    expect(transaction).not.toHaveBeenCalled();
    await dispatcher.onApplicationShutdown();
    transaction.mockRestore();
  });
  it('marks delivery only after ACK and preserves the persisted event ID', async () => {
    const value = event();
    await enqueue(value);
    await worker().drainOnce();
    expect(publish).toHaveBeenCalledWith(value);
    expect((await row(value.eventId)).deliveredAt).toBeInstanceOf(Date);
    await worker().drainOnce();
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it('retains failed sends with backoff and recovers with the same event ID', async () => {
    const value = event();
    await enqueue(value);
    publish.mockRejectedValueOnce(new Error('private broker details'));
    await worker().drainOnce();
    const failed = await row(value.eventId);
    expect(failed).toMatchObject({
      attempts: 1,
      deliveredAt: null,
      deadLetterAt: null,
      claimToken: null,
      lastError: 'KAFKA_DELIVERY_FAILED',
    });
    expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await worker().drainOnce();
    expect(publish).toHaveBeenCalledTimes(1);
    await db
      .getRepository(CommerceOutboxEvent)
      .update(value.eventId, { nextAttemptAt: new Date(0) });
    await worker().drainOnce();
    expect(publish.mock.calls.map(([sent]) => sent.eventId)).toEqual([
      value.eventId,
      value.eventId,
    ]);
    expect((await row(value.eventId)).deliveredAt).toBeInstanceOf(Date);
  });
  it('does not ACK or consume attempts if transport declines delivery', async () => {
    const value = event();
    await enqueue(value);
    publish.mockResolvedValue(false);
    await worker().drainOnce();
    expect(await row(value.eventId)).toMatchObject({
      attempts: 0,
      deliveredAt: null,
      claimToken: null,
    });
  });
  it.each(['invalid', 'exhausted', 'crashed'] as const)(
    'quarantines %s work durably without deleting it',
    async (reason) => {
      const value = event();
      await enqueue(value);
      await db.getRepository(CommerceOutboxEvent).update(
        value.eventId,
        reason === 'invalid'
          ? { envelopeEncrypted: 'corrupted' }
          : {
              attempts: reason === 'crashed' ? 10 : 9,
              claimedAt: new Date(0),
              claimToken: randomUUID(),
            },
      );
      publish.mockRejectedValue(new Error('offline'));
      await worker().drainOnce();
      expect((await row(value.eventId)).deadLetterAt).toBeInstanceOf(Date);
      await worker().drainOnce();
      expect(publish).toHaveBeenCalledTimes(reason === 'exhausted' ? 1 : 0);
    },
  );
  it('skips a locked row and lets another worker deliver different work', async () => {
    const first = event();
    await enqueue(first);
    const second = event();
    await enqueue(second);
    const lock = db.createQueryRunner();
    await lock.connect();
    await lock.startTransaction();
    try {
      await lock.manager.getRepository(CommerceOutboxEvent).findOne({
        where: { id: first.eventId },
        lock: { mode: 'pessimistic_write' },
      });
      await worker().drainOnce();
      expect(publish).toHaveBeenCalledWith(second);
      expect((await row(first.eventId)).deliveredAt).toBeNull();
    } finally {
      await lock.rollbackTransaction();
      await lock.release();
    }
    await worker().drainOnce();
    expect(publish).toHaveBeenCalledTimes(2);
  });
  it('prevents concurrent sends under a valid lease and fences stale ACKs', async () => {
    const value = event();
    await enqueue(value);
    let release!: (sent: boolean) => void;
    let started!: () => void;
    const sending = new Promise<void>((resolve) => {
      started = resolve;
    });
    publish.mockImplementationOnce(() => {
      started();
      return new Promise<boolean>((resolve) => {
        release = resolve;
      });
    });
    const pending = worker().drainOnce();
    await sending;
    await worker().drainOnce();
    expect(publish).toHaveBeenCalledTimes(1);
    const replacementToken = randomUUID();
    await db
      .getRepository(CommerceOutboxEvent)
      .update(value.eventId, { claimToken: replacementToken });
    release(true);
    await pending;
    expect(await row(value.eventId)).toMatchObject({
      deliveredAt: null,
      claimToken: replacementToken,
    });
    await db
      .getRepository(CommerceOutboxEvent)
      .update(value.eventId, { claimedAt: new Date(0) });
    await worker().drainOnce();
    expect((await row(value.eventId)).deliveredAt).toBeInstanceOf(Date);
  });
  it('applies, reverts and reapplies the additive migration with schema parity', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new CommerceOutbox1791561600000();
      await migration.down(runner);
      expect(await runner.hasTable('orders.commerce_outbox_events')).toBe(
        false,
      );
      await migration.up(runner);
      expect(await runner.hasTable('orders.commerce_outbox_events')).toBe(true);
      await migration.down(runner);
      await migration.up(runner);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    const schema = await new DataSource({
      ...dataSourceOptions,
      entities: [CommerceOutboxEvent],
      migrations: [],
      logging: false,
    }).initialize();
    try {
      expect(
        (await schema.driver.createSchemaBuilder().log()).upQueries,
      ).toEqual([]);
    } finally {
      await schema.destroy();
    }
  });
});
