import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { In, DataSource } from 'typeorm';
import {
  createItineraryOrderCreated,
  createItineraryPaymentConfirmed,
  createItineraryTicketIssued,
} from '../src/common/events/core-itinerary-events';
import { dataSourceOptions } from '../src/database/data-source.options';
import { ReportingItineraryEventProjection } from '../src/database/entities/reporting-itinerary-event-projection.entity';
import { ReportingItineraryEventReceipt } from '../src/database/entities/reporting-itinerary-event-receipt.entity';
import { ReportingKafkaConsumerCheckpoint } from '../src/database/entities/reporting-kafka-consumer-checkpoint.entity';
import {
  ReportingKafkaFailureStage,
  ReportingKafkaFailureStatus,
  ReportingKafkaProcessingFailure,
} from '../src/database/entities/reporting-kafka-processing-failure.entity';
import { ReportingItineraryProjections1791734400000 } from '../src/database/migrations/1791734400000-ReportingItineraryProjections';
import { ReportingKafkaConsumerCheckpoints1792156800000 } from '../src/database/migrations/1792156800000-ReportingKafkaConsumerCheckpoints';
import { ReportingKafkaFailureQuarantine1792329600000 } from '../src/database/migrations/1792329600000-ReportingKafkaFailureQuarantine';
import { ReportingDlqStore } from '../src/modules/reporting/reporting-dlq.store';
import { ReportingEventConsumer } from '../src/modules/reporting/reporting-event-consumer';
import { REPORTING_READ_MODEL_SINK } from '../src/modules/reporting/reporting-event-consumer';
import { ReportingItineraryProjectionStore } from '../src/modules/reporting/reporting-itinerary-projection.store';

describe('Reporting itinerary projection (PostgreSQL)', () => {
  let module: TestingModule;
  let db: DataSource;
  let consumer: ReportingEventConsumer;
  let dlq: ReportingDlqStore;
  const orderIds = new Set<string>();
  const consumerGroups = new Set<string>();
  const context = () => ({
    auditId: `audit-${randomUUID()}`,
    correlationId: `request-${randomUUID()}`,
    idempotencyKey: `projection-${randomUUID()}`,
  });
  const orderCreated = (orderId: string, version = 1, totalIrr = 120n) =>
    createItineraryOrderCreated(
      {
        id: orderId,
        version,
        status: 'HELD',
        channel: 'SYSTEM',
        currency: 'IRR',
        fareIrr: totalIrr - 20n,
        taxIrr: 20n,
        extrasIrr: 0n,
        totalIrr,
        createdAt: new Date('2026-09-06T00:00:00.000Z'),
        holdExpiresAt: new Date('2026-09-06T00:15:00.000Z'),
      },
      context(),
    );
  const nextOrderId = () => {
    const id = `reporting-test-${randomUUID()}`;
    orderIds.add(id);
    return id;
  };

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) ||
      !url.pathname.endsWith('_test')
    )
      throw new Error(
        'Reporting projection tests require a local test database',
      );
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          ...dataSourceOptions,
          logging: false,
          extra: { options: '-c timezone=UTC' },
        }),
        TypeOrmModule.forFeature([
          ReportingItineraryEventProjection,
          ReportingItineraryEventReceipt,
          ReportingKafkaConsumerCheckpoint,
          ReportingKafkaProcessingFailure,
        ]),
      ],
      providers: [
        ReportingItineraryProjectionStore,
        ReportingEventConsumer,
        ReportingDlqStore,
        {
          provide: REPORTING_READ_MODEL_SINK,
          useExisting: ReportingItineraryProjectionStore,
        },
      ],
    }).compile();
    await module.init();
    db = module.get(DataSource);
    consumer = module.get(ReportingEventConsumer);
    dlq = module.get(ReportingDlqStore);
  });

  afterEach(async () => {
    if (orderIds.size)
      await db.getRepository(ReportingItineraryEventProjection).delete({
        orderId: In([...orderIds]),
      });
    if (orderIds.size)
      await db.getRepository(ReportingItineraryEventReceipt).delete({
        orderId: In([...orderIds]),
      });
    if (consumerGroups.size)
      await db.getRepository(ReportingKafkaProcessingFailure).delete({
        consumerGroup: In([...consumerGroups]),
      });
    if (consumerGroups.size)
      await db.getRepository(ReportingKafkaConsumerCheckpoint).delete({
        consumerGroup: In([...consumerGroups]),
      });
    orderIds.clear();
    consumerGroups.clear();
  });

  afterAll(async () => {
    if (module) await module.close();
  });

  it('applies once and deduplicates exact or semantic replays', async () => {
    const orderId = nextOrderId();
    const first = orderCreated(orderId);
    await expect(consumer.consume(first)).resolves.toBe('applied');
    await expect(consumer.consume(first)).resolves.toBe('duplicate');
    const replay = {
      ...orderCreated(orderId),
      payload: { ...first.payload },
      occurredAt: first.occurredAt,
    };
    await expect(consumer.consume(replay)).resolves.toBe('duplicate');
    const rows = await db
      .getRepository(ReportingItineraryEventProjection)
      .find({
        where: { orderId },
      });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      eventId: first.eventId,
      orderVersion: 1,
      currency: 'IRR',
    });
    expect(
      await db.getRepository(ReportingItineraryEventReceipt).countBy({
        orderId,
      }),
    ).toBe(2);
  });

  it('commits monotonic Kafka progress in the projection transaction', async () => {
    const orderId = nextOrderId();
    const consumerGroup = `reporting-test-${randomUUID()}`;
    consumerGroups.add(consumerGroup);
    const first = orderCreated(orderId);

    await expect(
      consumer.consume(first, {
        consumerGroup,
        topic: 'blujet.events.v1',
        partition: 0,
        nextOffset: '5',
        highWatermark: '10',
      }),
    ).resolves.toBe('applied');
    await expect(
      consumer.consume(first, {
        consumerGroup,
        topic: 'blujet.events.v1',
        partition: 0,
        nextOffset: '3',
        highWatermark: '12',
      }),
    ).resolves.toBe('duplicate');

    const checkpoint = await db
      .getRepository(ReportingKafkaConsumerCheckpoint)
      .findOneByOrFail({
        consumerGroup,
        topic: 'blujet.events.v1',
        partition: 0,
      });
    expect(checkpoint).toMatchObject({
      nextOffset: '5',
      highWatermark: '12',
    });
    const store = module.get(ReportingItineraryProjectionStore);
    await expect(
      store.getCheckpointSummary(consumerGroup, 'blujet.events.v1'),
    ).resolves.toMatchObject({
      partitions: 1,
      maxLag: '7',
    });
  });

  it('does not regress a slot and fails closed on equal-version conflicts', async () => {
    const orderId = nextOrderId();
    const current = orderCreated(orderId, 3, 300n);
    const stale = orderCreated(orderId, 2, 200n);
    await expect(consumer.consume(current)).resolves.toBe('applied');
    await expect(consumer.consume(stale)).resolves.toBe('stale');
    await expect(consumer.consume(stale)).resolves.toBe('duplicate');
    await expect(
      consumer.consume(orderCreated(orderId, 3, 301n)),
    ).rejects.toBeInstanceOf(ConflictException);
    const row = await db
      .getRepository(ReportingItineraryEventProjection)
      .findOneByOrFail({ orderId, eventType: 'OrderCreated' });
    expect(row.eventId).toBe(current.eventId);
    expect(row.payload).toMatchObject({ totalIrr: '300' });
    expect(
      await db.getRepository(ReportingItineraryEventReceipt).countBy({
        orderId,
      }),
    ).toBe(2);
  });

  it('serializes concurrent deliveries for the same semantic slot', async () => {
    const orderId = nextOrderId();
    const first = orderCreated(orderId);
    const second = {
      ...orderCreated(orderId),
      payload: { ...first.payload },
      occurredAt: first.occurredAt,
    };
    const results = await Promise.all([
      consumer.consume(first),
      consumer.consume(second),
    ]);
    expect(results.sort()).toEqual(['applied', 'duplicate']);
    expect(
      await db.getRepository(ReportingItineraryEventProjection).countBy({
        orderId,
      }),
    ).toBe(1);
  });

  it('keeps different event types independently at one order version', async () => {
    const orderId = nextOrderId();
    const ticketedOrder = {
      id: orderId,
      version: 3,
      status: 'TICKETED' as const,
      currency: 'IRR' as const,
      totalIrr: 120n,
    };
    const paid = createItineraryPaymentConfirmed(
      ticketedOrder,
      {
        id: 'confirmation-1',
        orderId,
        status: 'COMPLETED',
        currency: 'IRR',
        amountIrr: 120n,
        failureCode: null,
        updatedAt: new Date('2026-09-06T00:05:00.000Z'),
      },
      context(),
    );
    const ticket = createItineraryTicketIssued(
      ticketedOrder,
      [
        {
          id: 'document-1',
          orderId,
          status: 'ISSUED',
          accountabilityStatus: 'ACCOUNTABLE',
          issueSource: 'CORE_ITINERARY_PAYMENT',
          issuedAt: new Date('2026-09-06T00:06:00.000Z'),
        },
      ],
      context(),
    );
    await expect(consumer.consume(paid)).resolves.toBe('applied');
    await expect(consumer.consume(ticket)).resolves.toBe('applied');
    expect(
      await db.getRepository(ReportingItineraryEventProjection).countBy({
        orderId,
      }),
    ).toBe(2);
  });

  it('rejects event ID reuse across projection slots', async () => {
    const firstOrderId = nextOrderId();
    const secondOrderId = nextOrderId();
    const first = orderCreated(firstOrderId);
    await consumer.consume(first);
    const reused = { ...orderCreated(secondOrderId), eventId: first.eventId };
    await expect(consumer.consume(reused)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(
      await db.getRepository(ReportingItineraryEventProjection).countBy({
        orderId: secondOrderId,
      }),
    ).toBe(0);
  });

  it('rejects historical event ID reuse after its projection advances', async () => {
    const firstOrderId = nextOrderId();
    const secondOrderId = nextOrderId();
    const first = orderCreated(firstOrderId, 1);
    await consumer.consume(first);
    await expect(consumer.consume(orderCreated(firstOrderId, 2))).resolves.toBe(
      'applied',
    );
    const reused = { ...orderCreated(secondOrderId), eventId: first.eventId };
    await expect(consumer.consume(reused)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(
      await db.getRepository(ReportingItineraryEventProjection).countBy({
        orderId: secondOrderId,
      }),
    ).toBe(0);
  });

  it('reverts and reapplies both additive Reporting tables', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new ReportingItineraryProjections1791734400000();
      await migration.down(runner);
      expect(
        await runner.hasTable('reporting.core_itinerary_event_projections'),
      ).toBe(false);
      expect(
        await runner.hasTable('reporting.core_itinerary_event_receipts'),
      ).toBe(false);
      await migration.up(runner);
      expect(
        await runner.hasTable('reporting.core_itinerary_event_projections'),
      ).toBe(true);
      expect(
        await runner.hasTable('reporting.core_itinerary_event_receipts'),
      ).toBe(true);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('reverts and reapplies the additive Kafka checkpoint table', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new ReportingKafkaConsumerCheckpoints1792156800000();
      await migration.down(runner);
      expect(
        await runner.hasTable('reporting.kafka_consumer_checkpoints'),
      ).toBe(false);
      await migration.up(runner);
      expect(
        await runner.hasTable('reporting.kafka_consumer_checkpoints'),
      ).toBe(true);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('quarantines poison deliveries and requires an explicit operator decision', async () => {
    const consumerGroup = `reporting-test-${randomUUID()}`;
    consumerGroups.add(consumerGroup);
    const delivery = {
      consumerGroup,
      topic: 'blujet.events.v1',
      partition: 0,
      offset: '41',
      nextOffset: '42',
      highWatermark: '50',
      fingerprint: 'a'.repeat(64),
    };

    await expect(
      dlq.recordFailure(
        delivery,
        ReportingKafkaFailureStage.PROJECTION,
        randomUUID(),
        3,
      ),
    ).resolves.toBe('retry');
    await expect(
      dlq.recordFailure(
        delivery,
        ReportingKafkaFailureStage.PROJECTION,
        null,
        3,
      ),
    ).resolves.toBe('retry');
    await expect(
      dlq.recordFailure(
        delivery,
        ReportingKafkaFailureStage.PROJECTION,
        null,
        3,
      ),
    ).resolves.toBe('quarantined');
    await expect(dlq.actionFor(delivery)).resolves.toBe('block');

    const row = await db
      .getRepository(ReportingKafkaProcessingFailure)
      .findOneByOrFail({ consumerGroup, offset: '41' });
    expect(row).toMatchObject({
      attempts: 3,
      totalAttempts: 3,
      status: ReportingKafkaFailureStatus.QUARANTINED,
    });

    await dlq.approve(row.id, 'retry', 'operator-1', 'projection fixed');
    await expect(dlq.actionFor(delivery)).resolves.toBe('process');
    await expect(
      dlq.recordFailure(
        delivery,
        ReportingKafkaFailureStage.PROJECTION,
        null,
        3,
      ),
    ).resolves.toBe('retry');
    await expect(
      db.getRepository(ReportingKafkaProcessingFailure).findOneByOrFail({
        id: row.id,
      }),
    ).resolves.toMatchObject({
      attempts: 1,
      totalAttempts: 4,
      status: ReportingKafkaFailureStatus.RETRYING,
    });
  });

  it('persists a skip checkpoint before allowing the broker acknowledgement', async () => {
    const consumerGroup = `reporting-test-${randomUUID()}`;
    consumerGroups.add(consumerGroup);
    const delivery = {
      consumerGroup,
      topic: 'blujet.events.v1',
      partition: 1,
      offset: '7',
      nextOffset: '8',
      highWatermark: '11',
      fingerprint: 'b'.repeat(64),
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await dlq.recordFailure(
        delivery,
        ReportingKafkaFailureStage.TRANSPORT,
        null,
        2,
      );
    }
    const row = await db
      .getRepository(ReportingKafkaProcessingFailure)
      .findOneByOrFail({ consumerGroup, offset: '7' });
    await dlq.approve(row.id, 'skip', 'operator-2', 'invalid legacy record');
    await expect(dlq.actionFor(delivery)).resolves.toBe('skip');
    await dlq.markSkipped(delivery);

    await expect(
      db.getRepository(ReportingKafkaConsumerCheckpoint).findOneByOrFail({
        consumerGroup,
        topic: delivery.topic,
        partition: delivery.partition,
      }),
    ).resolves.toMatchObject({ nextOffset: '8', highWatermark: '11' });
    await expect(
      db.getRepository(ReportingKafkaProcessingFailure).findOneByOrFail({
        id: row.id,
      }),
    ).resolves.toMatchObject({ status: ReportingKafkaFailureStatus.SKIPPED });
  });

  it('reverts and reapplies the additive failure quarantine table', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new ReportingKafkaFailureQuarantine1792329600000();
      await migration.down(runner);
      expect(await runner.hasTable('reporting.kafka_processing_failures')).toBe(
        false,
      );
      await migration.up(runner);
      expect(await runner.hasTable('reporting.kafka_processing_failures')).toBe(
        true,
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
