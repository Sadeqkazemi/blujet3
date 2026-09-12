import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { EachMessagePayload } from 'kafkajs';
import { DataSource } from 'typeorm';
import { loyaltyMigrationDataSourceOptions } from '../src/database/data-source.options';
import { LoyaltyKafkaHandler } from '../src/projection/loyalty-kafka.handler';
import { parseLoyaltyProjectionEvent } from '../src/projection/loyalty-projection-event';
import { LoyaltyProjectionConsumer } from '../src/projection/loyalty-projection.consumer';
import { reconcileLoyaltyProjection } from '../src/projection/loyalty-projection-reconciliation';
import { LoyaltyProjectionStore } from '../src/projection/loyalty-projection.store';

const at = '2026-09-12T10:00:00.000Z';

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
    producer: 'core-loyalty',
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

function memberEvent(
  memberId: string,
  version = 1,
  points = 0,
): Record<string, unknown> {
  return event('LoyaltyMemberProjected', 'LoyaltyMember', memberId, version, {
    userId: randomUUID(),
    fullName: 'Projection member',
    email: `${memberId}@example.invalid`,
    birthDate: null,
    nationalIdEnc: 'encrypted-national-id',
    nationalIdHash: `hash-${memberId}`,
    joinDate: at,
    points,
    level: 'SILVER',
    cardStatus: 'NONE',
    cardNo: null,
    issuedByLabelFa: null,
    createdAt: at,
    deactivatedAt: null,
    deactivatedById: null,
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('Loyalty version-aware projection (real PostgreSQL)', () => {
  let admin: DataSource;
  let source: DataSource;
  let projection: DataSource;
  let consumer: LoyaltyProjectionConsumer;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const sourceName = `blujet_loyalty_src_${suffix}_test`;
  const projectionName = `blujet_loyalty_dst_${suffix}_test`;

  function databaseUrl(base: URL, database: string): string {
    const url = new URL(base);
    url.pathname = `/${database}`;
    return url.toString();
  }

  beforeAll(async () => {
    const configuredUrl = process.env.LOYALTY_DATABASE_URL;
    if (!configuredUrl) throw new Error('LOYALTY_DATABASE_URL is required');
    const configured = new URL(configuredUrl);
    if (
      !['localhost', '127.0.0.1'].includes(configured.hostname) ||
      !configured.pathname.endsWith('_test')
    ) {
      throw new Error('Projection integration requires a local _test database');
    }
    admin = await new DataSource({
      type: 'postgres',
      url: databaseUrl(configured, 'postgres'),
    }).initialize();
    await admin.query(`CREATE DATABASE "${sourceName}"`);
    await admin.query(`CREATE DATABASE "${projectionName}"`);
    source = await new DataSource(
      loyaltyMigrationDataSourceOptions(databaseUrl(configured, sourceName)),
    ).initialize();
    projection = await new DataSource(
      loyaltyMigrationDataSourceOptions(
        databaseUrl(configured, projectionName),
      ),
    ).initialize();
    await source.runMigrations({ transaction: 'all' });
    await projection.runMigrations({ transaction: 'all' });
    consumer = new LoyaltyProjectionConsumer(
      new LoyaltyProjectionStore(projection),
    );
  });

  beforeEach(async () => {
    for (const db of [source, projection]) {
      await db.query(`TRUNCATE
        loyalty.loyalty_projection_event_receipts,
        loyalty.loyalty_projection_slots,
        loyalty.club_points_entries,
        loyalty.club_card_requests,
        loyalty.club_members,
        loyalty.club_tier_rules,
        loyalty.price_locks,
        loyalty.customer_referrals
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

  it('applies all six snapshots with one receipt and slot each', async () => {
    const memberId = randomUUID();
    const events = [
      memberEvent(memberId),
      event(
        'LoyaltyPointsEntryProjected',
        'LoyaltyPointsEntry',
        randomUUID(),
        1,
        {
          clubMemberId: memberId,
          type: 'EARN',
          signedPoints: 500,
          bookingId: randomUUID(),
          createdAt: at,
        },
      ),
      event(
        'LoyaltyCardRequestProjected',
        'LoyaltyCardRequest',
        randomUUID(),
        1,
        {
          memberId,
          level: 'SILVER',
          points: 500,
          status: 'SUBMITTED',
          assignedTo: null,
          decidedById: null,
          decidedAt: null,
          cardNo: null,
          history: [{ step: 'submitted', labelFa: 'ثبت', at }],
          createdAt: at,
        },
      ),
      event('LoyaltyTierRuleProjected', 'LoyaltyTierRule', randomUUID(), 1, {
        goldMinPoints: 5000,
        platinumMinPoints: 15000,
        cardRequestMinPoints: 5000,
        updatedById: randomUUID(),
        updatedAt: at,
        createdAt: at,
      }),
      event('LoyaltyPriceLockProjected', 'LoyaltyPriceLock', randomUUID(), 1, {
        userId: randomUUID(),
        flightInstanceId: randomUUID(),
        cabin: 'ECONOMY',
        lockedPriceIrr: '9007199254740993',
        feeIrr: '300000',
        feeCharged: true,
        status: 'ACTIVE',
        expiresAt: '2026-09-13T10:00:00.000Z',
        createdAt: at,
        bookingId: null,
      }),
      event('LoyaltyReferralProjected', 'LoyaltyReferral', randomUUID(), 1, {
        referrerUserId: randomUUID(),
        referredUserId: randomUUID(),
        status: 'SIGNED_UP',
        pointsAwarded: 0,
        firstBookingId: null,
        rewardedAt: null,
        createdAt: at,
        updatedAt: at,
      }),
    ];

    for (const input of events) {
      await expect(consumer.consume(input)).resolves.toBe('applied');
    }

    const controls = await projection.query<
      Array<{ receipts: string; slots: string }>
    >(`SELECT
      (SELECT COUNT(*)::text FROM loyalty.loyalty_projection_event_receipts) AS receipts,
      (SELECT COUNT(*)::text FROM loyalty.loyalty_projection_slots) AS slots`);
    expect(controls[0]).toEqual({ receipts: '6', slots: '6' });
    await expect(
      projection.query(
        'UPDATE loyalty.loyalty_projection_event_receipts SET "auditId"="auditId"',
      ),
    ).rejects.toThrow('receipts are immutable');
    await expect(
      projection.query(
        `INSERT INTO loyalty.loyalty_projection_slots
          ("aggregateType", "aggregateId", "recordVersion", "semanticFingerprint", "auditId")
         VALUES ('UnknownAggregate', $1, 1, $2, 'invalid-aggregate-test')`,
        [randomUUID(), '0'.repeat(64)],
      ),
    ).rejects.toThrow('loyalty_projection_slot_aggregate_type_check');
    const business = await projection.query<Array<{ count: string }>>(
      `SELECT (SELECT COUNT(*) FROM loyalty.club_members)
        + (SELECT COUNT(*) FROM loyalty.club_points_entries)
        + (SELECT COUNT(*) FROM loyalty.club_card_requests)
        + (SELECT COUNT(*) FROM loyalty.club_tier_rules)
        + (SELECT COUNT(*) FROM loyalty.price_locks)
        + (SELECT COUNT(*) FROM loyalty.customer_referrals) AS count`,
    );
    expect(String(business[0]?.count)).toBe('6');
  });

  it('accepts exact replay, applies newer state and records stale delivery', async () => {
    const memberId = randomUUID();
    const first = memberEvent(memberId);
    await expect(consumer.consume(first)).resolves.toBe('applied');
    await expect(consumer.consume(first)).resolves.toBe('duplicate');

    const alternate = clone(first);
    alternate.eventId = randomUUID();
    await expect(consumer.consume(alternate)).resolves.toBe('duplicate');

    const second = memberEvent(memberId, 2, 500);
    await expect(consumer.consume(second)).resolves.toBe('applied');

    const stale = clone(first);
    stale.eventId = randomUUID();
    await expect(consumer.consume(stale)).resolves.toBe('stale');

    const divergent = clone(second);
    divergent.eventId = randomUUID();
    (divergent.payload as Record<string, unknown>).points = 700;
    await expect(consumer.consume(divergent)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const rows = await projection.query<
      Array<{ points: number; version: number }>
    >('SELECT points, version FROM loyalty.club_members WHERE id=$1', [
      memberId,
    ]);
    expect(rows[0]).toEqual({ points: 500, version: 2 });
    const receipts = await projection.query<Array<{ count: string }>>(
      'SELECT COUNT(*)::text AS count FROM loyalty.loyalty_projection_event_receipts',
    );
    expect(receipts[0]?.count).toBe('4');

    await projection.query(
      'UPDATE loyalty.club_members SET email=$1 WHERE id=$2',
      ['drift@example.invalid', memberId],
    );
    const afterDrift = memberEvent(memberId, 3, 900);
    await expect(consumer.consume(afterDrift)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects reused event IDs and rolls back missing dependencies for retry', async () => {
    const memberId = randomUUID();
    const first = memberEvent(memberId);
    await consumer.consume(first);
    const reused = clone(first);
    reused.correlationId = randomUUID();
    await expect(consumer.consume(reused)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const missingMemberId = randomUUID();
    const points = event(
      'LoyaltyPointsEntryProjected',
      'LoyaltyPointsEntry',
      randomUUID(),
      1,
      {
        clubMemberId: missingMemberId,
        type: 'EARN',
        signedPoints: 500,
        bookingId: null,
        createdAt: at,
      },
    );
    await expect(consumer.consume(points)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const failedReceipt = await projection.query<Array<{ count: string }>>(
      'SELECT COUNT(*)::text AS count FROM loyalty.loyalty_projection_event_receipts WHERE "eventId"=$1',
      [points.eventId],
    );
    expect(failedReceipt[0]?.count).toBe('0');

    await consumer.consume(memberEvent(missingMemberId));
    await expect(consumer.consume(points)).resolves.toBe('applied');
  });

  it('replays an acknowledgement gap without another business row', async () => {
    const projected = parseLoyaltyProjectionEvent(memberEvent(randomUUID()));
    const handler = new LoyaltyKafkaHandler(consumer);
    const commitOffsets = jest
      .fn<Promise<void>, [unknown]>()
      .mockRejectedValueOnce(new Error('broker unavailable'))
      .mockResolvedValueOnce();
    const delivery: EachMessagePayload = {
      topic: 'blujet.events.v1',
      partition: 0,
      heartbeat: jest.fn<Promise<void>, []>().mockResolvedValue(),
      pause: jest.fn(),
      message: {
        offset: '10',
        key: Buffer.from(
          `${projected.producer}:${projected.aggregateType}:${projected.aggregateId}`,
        ),
        value: Buffer.from(JSON.stringify(projected)),
        headers: {
          'event-id': Buffer.from(projected.eventId),
          'correlation-id': Buffer.from(projected.correlationId),
          'event-version': Buffer.from('1'),
          'event-schema-id': Buffer.from(
            'blujet.loyalty.LoyaltyMemberProjected.v1',
          ),
        },
      },
    } as unknown as EachMessagePayload;
    const config = handler.runConfig(
      { commitOffsets },
      { topic: delivery.topic, requireSchemaId: true },
    );

    await expect(config.eachMessage!(delivery)).rejects.toThrow(
      'Loyalty Kafka processing failed',
    );
    await expect(config.eachMessage!(delivery)).resolves.toBeUndefined();

    const counts = await projection.query<
      Array<{ members: string; receipts: string; slots: string }>
    >(`SELECT
      (SELECT COUNT(*)::text FROM loyalty.club_members) AS members,
      (SELECT COUNT(*)::text FROM loyalty.loyalty_projection_event_receipts) AS receipts,
      (SELECT COUNT(*)::text FROM loyalty.loyalty_projection_slots) AS slots`);
    expect(counts[0]).toEqual({ members: '1', receipts: '1', slots: '1' });
    expect(commitOffsets).toHaveBeenLastCalledWith([
      { topic: delivery.topic, partition: 0, offset: '11' },
    ]);
  });

  it('reconciles six business tables without reading control tables', async () => {
    const member = memberEvent(randomUUID());
    const priceLock = event(
      'LoyaltyPriceLockProjected',
      'LoyaltyPriceLock',
      randomUUID(),
      1,
      {
        userId: randomUUID(),
        flightInstanceId: randomUUID(),
        cabin: 'ECONOMY',
        lockedPriceIrr: '1000000',
        feeIrr: '300000',
        feeCharged: true,
        status: 'ACTIVE',
        expiresAt: '2026-09-13T10:00:00.000Z',
        createdAt: at,
        bookingId: null,
      },
    );
    const sourceConsumer = new LoyaltyProjectionConsumer(
      new LoyaltyProjectionStore(source),
    );
    // Core added feeCharged later, so its physical column order differs from a
    // newly bootstrapped Loyalty database. Reproduce that layout difference.
    await source.query(
      'ALTER TABLE loyalty.price_locks DROP COLUMN "feeCharged"',
    );
    await source.query(
      'ALTER TABLE loyalty.price_locks ADD COLUMN "feeCharged" boolean NOT NULL DEFAULT false',
    );
    await sourceConsumer.consume(member);
    await sourceConsumer.consume(priceLock);
    await consumer.consume(member);
    await consumer.consume(priceLock);

    await expect(
      reconcileLoyaltyProjection(source, projection, 100),
    ).resolves.toMatchObject({
      status: 'MATCH',
      tables: expect.arrayContaining([
        expect.objectContaining({ table: 'club_members', status: 'MATCH' }),
        expect.objectContaining({ table: 'price_locks', status: 'MATCH' }),
      ]) as unknown,
    });

    await projection.query(
      'UPDATE loyalty.club_members SET email=$1 WHERE id=$2',
      ['different@example.invalid', member.aggregateId],
    );
    await expect(
      reconcileLoyaltyProjection(source, projection, 100),
    ).resolves.toMatchObject({
      status: 'MISMATCH',
      tables: expect.arrayContaining([
        expect.objectContaining({
          table: 'club_members',
          status: 'MISMATCH',
        }),
      ]) as unknown,
    });

    await expect(
      reconcileLoyaltyProjection(source, projection, 0),
    ).rejects.toThrow('limit must be');
  });

  it('rolls back only control tables and can restore them', async () => {
    await projection.undoLastMigration({ transaction: 'all' });
    const controls = await projection.query<
      Array<{ receipts: boolean; slots: boolean; members: boolean }>
    >(`SELECT
      to_regclass('loyalty.loyalty_projection_event_receipts') IS NOT NULL AS receipts,
      to_regclass('loyalty.loyalty_projection_slots') IS NOT NULL AS slots,
      to_regclass('loyalty.club_members') IS NOT NULL AS members`);
    expect(controls[0]).toEqual({
      receipts: false,
      slots: false,
      members: true,
    });
    await projection.runMigrations({ transaction: 'all' });
  });
});
