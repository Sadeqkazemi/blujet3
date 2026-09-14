import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { EachMessagePayload } from 'kafkajs';
import { DataSource } from 'typeorm';
import { agencyMigrationDataSourceOptions } from '../src/database/data-source.options';
import {
  AgencyKafkaFailureStage,
  AgencyKafkaFailureStatus,
  AgencyKafkaProcessingFailure,
} from '../src/database/entities/agency-kafka-processing-failure.entity';
import {
  type AgencyFailedDelivery,
  AgencyDlqStore,
} from '../src/projection/agency-dlq.store';
import { AgencyKafkaHandler } from '../src/projection/agency-kafka.handler';
import { AgencyProjectionConsumer } from '../src/projection/agency-projection.consumer';
import { reconcileAgencyProjection } from '../src/projection/agency-projection-reconciliation';
import {
  type AgencyEventDelivery,
  AgencyProjectionStore,
} from '../src/projection/agency-projection.store';

const at = '2026-09-13T10:00:00.000Z';

function event(
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  recordVersion: number,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    eventType,
    eventVersion: 1,
    occurredAt: at,
    producer: 'core-agency',
    aggregateType,
    aggregateId,
    correlationId: randomUUID(),
    idempotencyKey: randomUUID(),
    payload: {
      auditId: randomUUID(),
      recordVersion,
      ...payload,
    },
  };
}

function profileEvent(
  agencyId: string,
  version = 1,
  city = 'تهران',
): Record<string, unknown> {
  return event('AgencyProfileProjected', 'AgencyProfile', agencyId, version, {
    licenseNo: `LICENSE-${agencyId}`,
    managerName: 'مدیر آژانس',
    phone: '02100000000',
    email: `${agencyId}@example.invalid`,
    city,
    address: 'نشانی آژانس',
    tier: 'NORMAL',
    suspendedAt: null,
    suspendReason: null,
    joinedAt: at,
  });
}

function invoiceEvent(
  agencyId: string,
  invoiceId = randomUUID(),
): Record<string, unknown> {
  return event('AgencyInvoiceProjected', 'AgencyInvoice', invoiceId, 1, {
    agencyId,
    invoiceNo: `INV-${invoiceId}`,
    issuedById: randomUUID(),
    issuedAt: at,
    dueAt: '2026-10-13T10:00:00.000Z',
    amountIrr: '9007199254740993',
    status: 'UNPAID',
    paidAt: null,
    descriptionFa: 'شرح محرمانه',
    bookingId: randomUUID(),
  });
}

function creditEvent(
  agencyId: string,
  requestId = randomUUID(),
): Record<string, unknown> {
  return event(
    'AgencyCreditRequestProjected',
    'AgencyCreditRequest',
    requestId,
    1,
    {
      agencyId,
      requestedLimitIrr: '500000000',
      note: 'یادداشت محرمانه',
      status: 'PENDING',
      decidedById: null,
      decidedAt: null,
      createdAt: at,
    },
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function kafkaDelivery(nextOffset: string): AgencyEventDelivery {
  return {
    consumerGroup: 'agency-v1',
    topic: 'blujet.events.v1',
    partition: 0,
    nextOffset,
    highWatermark: '10',
  };
}

function kafkaPayload(input: Record<string, unknown>): EachMessagePayload {
  return {
    topic: 'blujet.events.v1',
    partition: 2,
    heartbeat: jest.fn<Promise<void>, []>().mockResolvedValue(),
    pause: jest.fn(),
    message: {
      offset: '11',
      highWatermark: '13',
      timestamp: '0',
      attributes: 0,
      key: Buffer.from(
        `${String(input.producer)}:${String(input.aggregateType)}:${String(input.aggregateId)}`,
      ),
      value: Buffer.from(JSON.stringify(input)),
      headers: {
        'event-id': Buffer.from(String(input.eventId)),
        'correlation-id': Buffer.from(String(input.correlationId)),
        'event-version': Buffer.from('1'),
        'event-schema-id': Buffer.from(
          `blujet.agency.${String(input.eventType)}.v1`,
        ),
      },
    },
  } as unknown as EachMessagePayload;
}

function foreignKafkaPayload(): EachMessagePayload {
  const input = {
    eventId: randomUUID(),
    eventType: 'OrderCreated',
    eventVersion: 1,
    occurredAt: at,
    producer: 'core-commerce',
    aggregateType: 'Order',
    aggregateId: randomUUID(),
    correlationId: randomUUID(),
    idempotencyKey: randomUUID(),
    payload: { status: 'HELD' },
  };
  return {
    topic: 'blujet.events.v1',
    partition: 5,
    heartbeat: jest.fn<Promise<void>, []>().mockResolvedValue(),
    pause: jest.fn(),
    message: {
      offset: '31',
      highWatermark: '32',
      timestamp: '0',
      attributes: 0,
      key: Buffer.from(
        `${input.producer}:${input.aggregateType}:${input.aggregateId}`,
      ),
      value: Buffer.from(JSON.stringify(input)),
      headers: {
        'event-id': Buffer.from(input.eventId),
        'correlation-id': Buffer.from(input.correlationId),
        'event-version': Buffer.from('1'),
        'event-schema-id': Buffer.from('blujet.core-itinerary.OrderCreated.v1'),
      },
    },
  } as unknown as EachMessagePayload;
}

describe('Agency version-aware projection (real PostgreSQL)', () => {
  let admin: DataSource;
  let source: DataSource;
  let projection: DataSource;
  let consumer: AgencyProjectionConsumer;
  let dlq: AgencyDlqStore;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const sourceName = `blujet_agency_src_${suffix}_test`;
  const projectionName = `blujet_agency_dst_${suffix}_test`;

  function databaseUrl(base: URL, database: string): string {
    const url = new URL(base);
    url.pathname = `/${database}`;
    return url.toString();
  }

  beforeAll(async () => {
    const configuredUrl = process.env.AGENCY_DATABASE_URL;
    if (!configuredUrl) throw new Error('AGENCY_DATABASE_URL is required');
    const configured = new URL(configuredUrl);
    if (
      !['localhost', '127.0.0.1'].includes(configured.hostname) ||
      !configured.pathname.endsWith('_test')
    )
      throw new Error('Projection integration requires a local _test database');
    admin = await new DataSource({
      type: 'postgres',
      url: databaseUrl(configured, 'postgres'),
    }).initialize();
    await admin.query(`CREATE DATABASE "${sourceName}"`);
    await admin.query(`CREATE DATABASE "${projectionName}"`);
    source = await new DataSource(
      agencyMigrationDataSourceOptions(databaseUrl(configured, sourceName)),
    ).initialize();
    projection = await new DataSource(
      agencyMigrationDataSourceOptions(databaseUrl(configured, projectionName)),
    ).initialize();
    await source.runMigrations({ transaction: 'all' });
    await projection.runMigrations({ transaction: 'all' });
    consumer = new AgencyProjectionConsumer(
      new AgencyProjectionStore(projection),
    );
    dlq = new AgencyDlqStore(projection);
  });

  beforeEach(async () => {
    for (const db of [source, projection]) {
      await db.query(`TRUNCATE
        agency.kafka_consumer_checkpoints,
        agency.kafka_processing_failures,
        agency.agency_projection_event_receipts,
        agency.agency_projection_slots,
        agency.agency_invoices,
        agency.agency_credit_requests,
        agency.agency_profiles
        RESTART IDENTITY CASCADE`);
    }
  });

  afterAll(async () => {
    await source?.destroy();
    await projection?.destroy();
    for (const database of [sourceName, projectionName]) {
      await admin?.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()',
        [database],
      );
      await admin?.query(`DROP DATABASE IF EXISTS "${database}"`);
    }
    await admin?.destroy();
  });

  it('applies all three projections with one receipt and slot each', async () => {
    const agencyId = randomUUID();
    const events = [
      profileEvent(agencyId),
      invoiceEvent(agencyId),
      creditEvent(agencyId),
    ];

    for (const input of events)
      await expect(consumer.consume(input)).resolves.toBe('applied');

    const rows = await projection.query<
      Array<{
        profiles: number;
        invoices: number;
        credits: number;
        receipts: number;
        slots: number;
      }>
    >(`SELECT
      (SELECT count(*)::int FROM agency.agency_profiles) AS profiles,
      (SELECT count(*)::int FROM agency.agency_invoices) AS invoices,
      (SELECT count(*)::int FROM agency.agency_credit_requests) AS credits,
      (SELECT count(*)::int FROM agency.agency_projection_event_receipts) AS receipts,
      (SELECT count(*)::int FROM agency.agency_projection_slots) AS slots`);
    expect(rows).toEqual([
      { profiles: 1, invoices: 1, credits: 1, receipts: 3, slots: 3 },
    ]);
    const invoice = await projection.query<
      Array<{ amountIrr: string; version: number }>
    >(
      'SELECT "amountIrr"::text AS "amountIrr", version FROM agency.agency_invoices',
    );
    expect(invoice).toEqual([{ amountIrr: '9007199254740993', version: 1 }]);
  });

  it('accepts exact replay, applies newer state and records stale delivery', async () => {
    const agencyId = randomUUID();
    const initial = profileEvent(agencyId);
    const newer = profileEvent(agencyId, 3, 'شیراز');
    const stale = profileEvent(agencyId, 2, 'تبریز');

    await expect(consumer.consume(initial, kafkaDelivery('2'))).resolves.toBe(
      'applied',
    );
    await expect(consumer.consume(initial, kafkaDelivery('3'))).resolves.toBe(
      'duplicate',
    );
    await expect(consumer.consume(newer, kafkaDelivery('4'))).resolves.toBe(
      'applied',
    );
    await expect(consumer.consume(stale, kafkaDelivery('5'))).resolves.toBe(
      'stale',
    );

    expect(
      await projection.query(
        'SELECT city, version FROM agency.agency_profiles WHERE "userId"=$1',
        [agencyId],
      ),
    ).toEqual([{ city: 'شیراز', version: 3 }]);
    expect(
      await projection.query(
        'SELECT count(*)::int AS count FROM agency.agency_projection_event_receipts',
      ),
    ).toEqual([{ count: 3 }]);

    await projection.query(
      'UPDATE agency.agency_profiles SET city=$1 WHERE "userId"=$2',
      ['ناسازگار', agencyId],
    );
    await expect(
      consumer.consume(profileEvent(agencyId, 4, 'مشهد'), kafkaDelivery('6')),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await projection.query(
        'SELECT "nextOffset" FROM agency.kafka_consumer_checkpoints',
      ),
    ).toEqual([{ nextOffset: '5' }]);
  });

  it('rejects event-ID reuse and divergent same-version snapshots', async () => {
    const agencyId = randomUUID();
    const initial = profileEvent(agencyId);
    await consumer.consume(initial);

    const reused = clone(initial);
    (reused.payload as Record<string, unknown>).city = 'مشهد';
    await expect(consumer.consume(reused)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const divergent = profileEvent(agencyId, 1, 'اهواز');
    await expect(consumer.consume(divergent)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(
      await projection.query(
        'SELECT city, version FROM agency.agency_profiles WHERE "userId"=$1',
        [agencyId],
      ),
    ).toEqual([{ city: 'تهران', version: 1 }]);
    expect(
      await projection.query(
        'SELECT count(*)::int AS count FROM agency.agency_projection_event_receipts',
      ),
    ).toEqual([{ count: 1 }]);
  });

  it('rolls back a missing profile dependency and retries safely', async () => {
    const agencyId = randomUUID();
    const invoice = invoiceEvent(agencyId);

    await expect(
      consumer.consume(invoice, kafkaDelivery('4')),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await projection.query(
        'SELECT count(*)::int AS count FROM agency.agency_projection_event_receipts',
      ),
    ).toEqual([{ count: 0 }]);
    expect(
      await projection.query(
        'SELECT count(*)::int AS count FROM agency.kafka_consumer_checkpoints',
      ),
    ).toEqual([{ count: 0 }]);

    await consumer.consume(profileEvent(agencyId));
    await expect(consumer.consume(invoice)).resolves.toBe('applied');
  });

  it('serializes concurrent redelivery without duplicate business rows', async () => {
    const input = profileEvent(randomUUID());

    const results = await Promise.all([
      consumer.consume(input),
      consumer.consume(clone(input)),
    ]);

    expect(results.sort()).toEqual(['applied', 'duplicate']);
    expect(
      await projection.query(
        `SELECT
          (SELECT count(*)::int FROM agency.agency_profiles) AS profiles,
          (SELECT count(*)::int FROM agency.agency_projection_event_receipts) AS receipts,
          (SELECT count(*)::int FROM agency.agency_projection_slots) AS slots`,
      ),
    ).toEqual([{ profiles: 1, receipts: 1, slots: 1 }]);
  });

  it('replays an acknowledgement gap without duplicate projection rows', async () => {
    const input = profileEvent(randomUUID());
    const handler = new AgencyKafkaHandler(
      consumer,
      dlq,
      { enabled: false },
      new AgencyProjectionStore(projection),
    );
    const firstAck = jest
      .fn<Promise<void>, [unknown]>()
      .mockRejectedValue(new Error('broker unavailable'));
    const secondAck = jest.fn<Promise<void>, [unknown]>().mockResolvedValue();

    await expect(
      handler.runConfig(
        { commitOffsets: firstAck },
        {
          topic: 'blujet.events.v1',
          consumerGroup: 'agency-v1',
          requireSchemaId: true,
        },
      ).eachMessage!(kafkaPayload(input)),
    ).rejects.toThrow('Agency Kafka processing failed');

    await handler.runConfig(
      { commitOffsets: secondAck },
      {
        topic: 'blujet.events.v1',
        consumerGroup: 'agency-v1',
        requireSchemaId: true,
      },
    ).eachMessage!(kafkaPayload(input));

    expect(firstAck).toHaveBeenCalledTimes(1);
    expect(secondAck).toHaveBeenCalledWith([
      { topic: 'blujet.events.v1', partition: 2, offset: '12' },
    ]);
    expect(
      await projection.query(
        `SELECT
          (SELECT count(*)::int FROM agency.agency_profiles) AS profiles,
          (SELECT count(*)::int FROM agency.agency_projection_event_receipts) AS receipts,
          (SELECT count(*)::int FROM agency.agency_projection_slots) AS slots,
          (SELECT count(*)::int FROM agency.kafka_consumer_checkpoints) AS checkpoints`,
      ),
    ).toEqual([{ profiles: 1, receipts: 1, slots: 1, checkpoints: 1 }]);
    expect(
      await projection.query(
        `SELECT "nextOffset", "highWatermark"
         FROM agency.kafka_consumer_checkpoints
         WHERE "consumerGroup"=$1 AND topic=$2 AND "partition"=$3`,
        ['agency-v1', 'blujet.events.v1', 2],
      ),
    ).toEqual([{ nextOffset: '12', highWatermark: '13' }]);
  });

  it('durably checkpoints foreign-domain traffic without projection state', async () => {
    const handler = new AgencyKafkaHandler(
      consumer,
      dlq,
      { enabled: false },
      new AgencyProjectionStore(projection),
    );
    const commitOffsets = jest
      .fn<Promise<void>, [unknown]>()
      .mockResolvedValue();

    await handler.runConfig(
      { commitOffsets },
      {
        topic: 'blujet.events.v1',
        consumerGroup: 'agency-v1',
        requireSchemaId: true,
      },
    ).eachMessage!(foreignKafkaPayload());

    expect(commitOffsets).toHaveBeenCalledWith([
      { topic: 'blujet.events.v1', partition: 5, offset: '32' },
    ]);
    expect(
      await projection.query(
        `SELECT
          (SELECT count(*)::int FROM agency.agency_profiles) AS profiles,
          (SELECT count(*)::int FROM agency.agency_projection_event_receipts) AS receipts,
          (SELECT count(*)::int FROM agency.agency_projection_slots) AS slots,
          (SELECT count(*)::int FROM agency.kafka_processing_failures) AS failures,
          (SELECT count(*)::int FROM agency.kafka_consumer_checkpoints) AS checkpoints`,
      ),
    ).toEqual([
      { profiles: 0, receipts: 0, slots: 0, failures: 0, checkpoints: 1 },
    ]);
    expect(
      await projection.query(
        `SELECT "nextOffset", "highWatermark"
         FROM agency.kafka_consumer_checkpoints
         WHERE "consumerGroup"=$1 AND topic=$2 AND "partition"=$3`,
        ['agency-v1', 'blujet.events.v1', 5],
      ),
    ).toEqual([{ nextOffset: '32', highWatermark: '32' }]);
  });

  it('keeps durable checkpoint coordinates monotonic on replay', async () => {
    const projected = profileEvent(randomUUID());

    await expect(
      consumer.consume(projected, {
        consumerGroup: 'agency-v1',
        topic: 'blujet.events.v1',
        partition: 3,
        nextOffset: '21',
        highWatermark: '30',
      }),
    ).resolves.toBe('applied');
    await expect(
      consumer.consume(projected, {
        consumerGroup: 'agency-v1',
        topic: 'blujet.events.v1',
        partition: 3,
        nextOffset: '11',
        highWatermark: '15',
      }),
    ).resolves.toBe('duplicate');

    expect(
      await projection.query(
        'SELECT "nextOffset", "highWatermark" FROM agency.kafka_consumer_checkpoints',
      ),
    ).toEqual([{ nextOffset: '21', highWatermark: '30' }]);
    const state = await new AgencyProjectionStore(
      projection,
    ).getCheckpointState('agency-v1', 'blujet.events.v1');
    expect(state).toMatchObject({ partitions: [3], maxLag: '9' });
    expect(typeof state.lastCheckpointAt).toBe('string');
  });

  it('quarantines bounded failures and requires matching delivery content', async () => {
    const delivery: AgencyFailedDelivery = {
      consumerGroup: 'agency-v1',
      topic: 'blujet.events.v1',
      partition: 2,
      offset: '14',
      nextOffset: '15',
      highWatermark: '20',
      fingerprint: 'a'.repeat(64),
    };

    await expect(
      dlq.recordFailure(delivery, AgencyKafkaFailureStage.TRANSPORT, null, 3),
    ).resolves.toBe('retry');
    await expect(
      dlq.recordFailure(
        delivery,
        AgencyKafkaFailureStage.PROJECTION,
        randomUUID(),
        3,
      ),
    ).resolves.toBe('retry');
    await expect(
      dlq.recordFailure(
        delivery,
        AgencyKafkaFailureStage.PROJECTION,
        randomUUID(),
        3,
      ),
    ).resolves.toBe('quarantined');
    await expect(dlq.actionFor(delivery)).resolves.toBe('block');
    await expect(
      dlq.actionFor({ ...delivery, fingerprint: 'b'.repeat(64) }),
    ).rejects.toBeInstanceOf(ConflictException);

    const row = await projection
      .getRepository(AgencyKafkaProcessingFailure)
      .findOneByOrFail({ offset: delivery.offset });
    expect(row).toMatchObject({
      attempts: 3,
      totalAttempts: 3,
      status: AgencyKafkaFailureStatus.QUARANTINED,
      stage: AgencyKafkaFailureStage.PROJECTION,
    });
    const listed = await dlq.list(AgencyKafkaFailureStatus.QUARANTINED, 1);
    expect(listed).toHaveLength(1);
    expect(Object.keys(listed[0])).not.toEqual(
      expect.arrayContaining(['consumerGroup', 'topic', 'partition', 'offset']),
    );

    await dlq.approve(row.id, 'retry', 'operator-1', 'dependency restored');
    await expect(dlq.actionFor(delivery)).resolves.toBe('process');
    await expect(
      dlq.recordFailure(
        delivery,
        AgencyKafkaFailureStage.PROJECTION,
        row.eventId,
        3,
      ),
    ).resolves.toBe('retry');
    await dlq.markResolved(delivery);
    const resolved = await projection
      .getRepository(AgencyKafkaProcessingFailure)
      .findOneByOrFail({ id: row.id });
    expect(resolved).toMatchObject({
      attempts: 1,
      totalAttempts: 4,
      status: AgencyKafkaFailureStatus.RESOLVED,
    });
  });

  it('advances checkpoint atomically for an approved skip and replays safely', async () => {
    const delivery: AgencyFailedDelivery = {
      consumerGroup: 'agency-v1',
      topic: 'blujet.events.v1',
      partition: 4,
      offset: '40',
      nextOffset: '41',
      highWatermark: '50',
      fingerprint: 'c'.repeat(64),
    };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await dlq.recordFailure(
        delivery,
        AgencyKafkaFailureStage.TRANSPORT,
        null,
        3,
      );
    }
    const row = await projection
      .getRepository(AgencyKafkaProcessingFailure)
      .findOneByOrFail({ offset: delivery.offset });
    await dlq.approve(row.id, 'skip', 'operator-2', 'invalid legacy envelope');
    await expect(dlq.actionFor(delivery)).resolves.toBe('skip');

    await expect(
      dlq.markSkipped({ ...delivery, nextOffset: '-1' }),
    ).rejects.toThrow();
    expect(
      await projection
        .getRepository(AgencyKafkaProcessingFailure)
        .findOneByOrFail({ id: row.id }),
    ).toMatchObject({ status: AgencyKafkaFailureStatus.SKIP_APPROVED });
    expect(
      await projection.query(
        'SELECT count(*)::int AS count FROM agency.kafka_consumer_checkpoints',
      ),
    ).toEqual([{ count: 0 }]);

    await dlq.markSkipped(delivery);
    await dlq.markSkipped(delivery);

    const state = await projection.query<
      Array<{ status: string; nextOffset: string; highWatermark: string }>
    >(
      `SELECT failure.status, checkpoint."nextOffset", checkpoint."highWatermark"
       FROM agency.kafka_processing_failures failure
       JOIN agency.kafka_consumer_checkpoints checkpoint
         ON checkpoint."consumerGroup"=failure."consumerGroup"
        AND checkpoint.topic=failure.topic
        AND checkpoint.partition=failure.partition
       WHERE failure.id=$1`,
      [row.id],
    );
    expect(state).toEqual([
      {
        status: AgencyKafkaFailureStatus.SKIPPED,
        nextOffset: '41',
        highWatermark: '50',
      },
    ]);
    await expect(dlq.actionFor(delivery)).resolves.toBe('skip');
  });

  it('reconciles only business tables without emitting business values', async () => {
    const agencyId = randomUUID();
    const events = [profileEvent(agencyId), invoiceEvent(agencyId)];
    const sourceConsumer = new AgencyProjectionConsumer(
      new AgencyProjectionStore(source),
    );
    for (const input of events) {
      await sourceConsumer.consume(input);
      await consumer.consume(input);
    }

    const matching = await reconcileAgencyProjection(source, projection, 100);
    expect(matching).toMatchObject({
      status: 'MATCH',
      tables: expect.arrayContaining([
        expect.objectContaining({ table: 'agency_profiles', status: 'MATCH' }),
        expect.objectContaining({ table: 'agency_invoices', status: 'MATCH' }),
      ]) as unknown,
    });
    const serialized = JSON.stringify(matching);
    for (const value of [agencyId, 'شرح محرمانه', '9007199254740993'])
      expect(serialized).not.toContain(value);

    await projection.query(
      'UPDATE agency.agency_profiles SET city=$1 WHERE "userId"=$2',
      ['متفاوت', agencyId],
    );
    await expect(
      reconcileAgencyProjection(source, projection, 100),
    ).resolves.toMatchObject({ status: 'MISMATCH' });

    const secondProfile = profileEvent(randomUUID());
    await sourceConsumer.consume(secondProfile);
    await consumer.consume(secondProfile);
    await expect(
      reconcileAgencyProjection(source, projection, 1),
    ).resolves.toMatchObject({ status: 'INCONCLUSIVE' });
    await expect(
      reconcileAgencyProjection(source, projection, 0),
    ).rejects.toThrow('limit must be');
  });

  it('keeps standalone migration and entity metadata aligned', async () => {
    const schema = await projection.driver.createSchemaBuilder().log();

    expect(schema.upQueries.map((query) => query.query)).toEqual([]);
  });

  it('rolls back and restores only the failure-registry migration', async () => {
    await projection.undoLastMigration({ transaction: 'all' });
    const state = await projection.query<
      Array<{
        profiles: boolean;
        receipts: boolean;
        checkpoints: boolean;
        failures: boolean;
        versionColumn: boolean;
      }>
    >(`SELECT
      to_regclass('agency.agency_profiles') IS NOT NULL AS profiles,
      to_regclass('agency.agency_projection_event_receipts') IS NOT NULL AS receipts,
      to_regclass('agency.kafka_consumer_checkpoints') IS NOT NULL AS checkpoints,
      to_regclass('agency.kafka_processing_failures') IS NOT NULL AS failures,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='agency' AND table_name='agency_profiles'
          AND column_name='version'
      ) AS "versionColumn"`);
    expect(state).toEqual([
      {
        profiles: true,
        receipts: true,
        checkpoints: true,
        failures: false,
        versionColumn: true,
      },
    ]);

    await projection.runMigrations({ transaction: 'all' });
    expect(
      await projection.query(
        `SELECT
          to_regclass('agency.kafka_consumer_checkpoints') IS NOT NULL AS checkpoints,
          to_regclass('agency.kafka_processing_failures') IS NOT NULL AS failures`,
      ),
    ).toEqual([{ checkpoints: true, failures: true }]);
  });
});
