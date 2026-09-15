import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  runLoyaltyCutoverReadinessCheck,
  serializeLoyaltyCutoverReport,
} from '../src/check-loyalty-cutover-readiness';
import { loyaltyMigrationDataSourceOptions } from '../src/database/data-source.options';
import { LoyaltyProjectionConsumer } from '../src/projection/loyalty-projection.consumer';
import { LoyaltyProjectionStore } from '../src/projection/loyalty-projection.store';

const CAPTURED_AT = '2026-09-15T12:00:00.000Z';
const EVENT_AT = '2026-09-15T10:00:00.000Z';
const GROUP = 'blujet-loyalty-cutover-e2e';
const TOPIC = 'blujet.events.v1';

describe('Loyalty cutover readiness (real PostgreSQL)', () => {
  let admin: DataSource;
  let source: DataSource;
  let target: DataSource;
  let sourceUrl: string;
  let targetUrl: string;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const sourceName = `blujet_core_cutover_${suffix}_test`;
  const targetName = `blujet_loyalty_cutover_${suffix}_test`;

  function databaseUrl(base: URL, database: string): string {
    const url = new URL(base);
    url.pathname = `/${database}`;
    return url.toString();
  }

  function env(): NodeJS.ProcessEnv {
    return {
      TZ: 'UTC',
      LOYALTY_CUTOVER_CHECK_ENABLED: 'true',
      LOYALTY_CUTOVER_SOURCE_DATABASE_URL: sourceUrl,
      LOYALTY_CUTOVER_TARGET_DATABASE_URL: targetUrl,
      LOYALTY_CUTOVER_KAFKA_GROUP_ID: GROUP,
      LOYALTY_CUTOVER_KAFKA_TOPIC: TOPIC,
      LOYALTY_CUTOVER_EXPECTED_PARTITIONS: '0',
      LOYALTY_CUTOVER_RECONCILIATION_LIMIT: '100',
    };
  }

  function memberEvent(): Record<string, unknown> {
    const memberId = randomUUID();
    return {
      eventId: randomUUID(),
      eventType: 'LoyaltyMemberProjected',
      eventVersion: 1,
      occurredAt: EVENT_AT,
      producer: 'core-loyalty',
      aggregateType: 'LoyaltyMember',
      aggregateId: memberId,
      correlationId: randomUUID(),
      idempotencyKey: randomUUID(),
      payload: {
        auditId: randomUUID(),
        recordVersion: 1,
        userId: randomUUID(),
        fullName: 'Cutover member',
        email: `${memberId}@example.invalid`,
        birthDate: null,
        nationalIdEnc: 'encrypted-cutover-value',
        nationalIdHash: `hash-${memberId}`,
        joinDate: EVENT_AT,
        points: 250,
        level: 'SILVER',
        cardStatus: 'NONE',
        cardNo: null,
        issuedByLabelFa: null,
        createdAt: EVENT_AT,
        deactivatedAt: null,
        deactivatedById: null,
      },
    };
  }

  async function seedReadyState(): Promise<void> {
    for (const database of [source, target]) {
      await database.query(`TRUNCATE
        loyalty.kafka_consumer_checkpoints,
        loyalty.kafka_processing_failures,
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
    await source.query('TRUNCATE loyalty.loyalty_projection_audits');
    await source.query('TRUNCATE orders.commerce_outbox_events');
    const event = memberEvent();
    await new LoyaltyProjectionConsumer(
      new LoyaltyProjectionStore(source),
    ).consume(event);
    await new LoyaltyProjectionConsumer(
      new LoyaltyProjectionStore(target),
    ).consume(event, {
      consumerGroup: GROUP,
      topic: TOPIC,
      partition: 0,
      nextOffset: '8',
      highWatermark: '8',
    });
    const payload = event.payload as Record<string, unknown>;
    await source.query(
      `INSERT INTO loyalty.loyalty_projection_audits
        (id, "aggregateType", "aggregateId", "recordVersion", mutation)
       VALUES ($1, $2, $3, $4, 'CREATED')`,
      [payload.auditId, event.aggregateType, event.aggregateId, 1],
    );
    await source.query(
      `INSERT INTO orders.commerce_outbox_events
        (producer, "deliveredAt", "deadLetterAt", "claimedAt")
       VALUES ('core-loyalty', $1, NULL, NULL)`,
      [EVENT_AT],
    );
  }

  beforeAll(async () => {
    const configuredUrl = process.env.LOYALTY_DATABASE_URL;
    if (!configuredUrl) throw new Error('LOYALTY_DATABASE_URL is required');
    const configured = new URL(configuredUrl);
    if (
      !['localhost', '127.0.0.1'].includes(configured.hostname) ||
      !configured.pathname.endsWith('_test')
    ) {
      throw new Error('Cutover E2E requires a local _test database');
    }
    admin = await new DataSource({
      type: 'postgres',
      url: databaseUrl(configured, 'postgres'),
    }).initialize();
    await admin.query(`CREATE DATABASE "${sourceName}"`);
    await admin.query(`CREATE DATABASE "${targetName}"`);
    sourceUrl = databaseUrl(configured, sourceName);
    targetUrl = databaseUrl(configured, targetName);
    source = await new DataSource(
      loyaltyMigrationDataSourceOptions(sourceUrl),
    ).initialize();
    target = await new DataSource(
      loyaltyMigrationDataSourceOptions(targetUrl),
    ).initialize();
    await source.runMigrations({ transaction: 'all' });
    await target.runMigrations({ transaction: 'all' });
    await source.query(`CREATE TABLE loyalty.loyalty_projection_audits (
      id uuid PRIMARY KEY,
      "aggregateType" text NOT NULL,
      "aggregateId" text NOT NULL,
      "recordVersion" integer NOT NULL,
      mutation text NOT NULL
    )`);
    await source.query('CREATE SCHEMA orders');
    await source.query(`CREATE TABLE orders.commerce_outbox_events (
      producer text NOT NULL,
      "deliveredAt" timestamp,
      "deadLetterAt" timestamp,
      "claimedAt" timestamp
    )`);
  });

  beforeEach(seedReadyState);

  afterAll(async () => {
    await source?.destroy();
    await target?.destroy();
    for (const database of [sourceName, targetName]) {
      await admin?.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()',
        [database],
      );
      await admin?.query(`DROP DATABASE IF EXISTS "${database}"`);
    }
    await admin?.destroy();
  });

  it('returns metadata-only READY for exact rows, receipts, slots and offsets', async () => {
    const report = await runLoyaltyCutoverReadinessCheck({
      env: env(),
      capturedAt: CAPTURED_AT,
    });
    expect(report).toEqual(
      expect.objectContaining({
        status: 'READY',
        reasons: [],
        sourceRowCount: '1',
        targetRowCount: '1',
        auditReceiptParity: true,
        slotMismatchCount: '0',
        blockingOutboxCount: '0',
        openFailureCount: '0',
        maxLag: '0',
      }),
    );
    const output = serializeLoyaltyCutoverReport(report);
    expect(output).not.toMatch(
      /Cutover member|encrypted-cutover|@example\.invalid|postgresql:|hash-/,
    );
  });

  it('blocks business drift without modifying either database', async () => {
    await target.query(
      `UPDATE loyalty.club_members SET email='drift@example.invalid'`,
    );
    const before = await target.query<Array<{ email: string }>>(
      'SELECT email FROM loyalty.club_members',
    );
    const report = await runLoyaltyCutoverReadinessCheck({ env: env() });
    const after = await target.query<Array<{ email: string }>>(
      'SELECT email FROM loyalty.club_members',
    );
    expect(report.status).toBe('NOT_READY');
    expect(report.reasons).toContain('PROJECTION_MISMATCH');
    expect(after).toEqual(before);
  });

  it('blocks pending outbox work and Kafka lag', async () => {
    await source.query(
      `UPDATE orders.commerce_outbox_events
          SET "deliveredAt"=NULL, "claimedAt"=CURRENT_TIMESTAMP`,
    );
    await target.query(
      `UPDATE loyalty.kafka_consumer_checkpoints
          SET "nextOffset"=7, "highWatermark"=9`,
    );
    const report = await runLoyaltyCutoverReadinessCheck({ env: env() });
    expect(report.status).toBe('NOT_READY');
    expect(report.reasons).toEqual(
      expect.arrayContaining([
        'OUTBOX_PENDING',
        'OUTBOX_IN_FLIGHT',
        'CHECKPOINT_LAG',
      ]),
    );
    expect(report.maxLag).toBe('2');
  });

  it('blocks receipt, slot and unresolved-DLQ inconsistencies', async () => {
    await source.query(
      `INSERT INTO loyalty.loyalty_projection_audits
        (id, "aggregateType", "aggregateId", "recordVersion", mutation)
       VALUES ($1, 'LoyaltyMember', $2, 2, 'UPDATED')`,
      [randomUUID(), randomUUID()],
    );
    await target.query(
      `INSERT INTO loyalty.loyalty_projection_slots
        ("aggregateType", "aggregateId", "recordVersion",
         "semanticFingerprint", "auditId")
       VALUES ('LoyaltyMember', $1, 1, $2, $3)`,
      [randomUUID(), '0'.repeat(64), randomUUID()],
    );
    await target.query(
      `INSERT INTO loyalty.kafka_processing_failures
        ("consumerGroup", topic, partition, "offset", fingerprint,
         stage, attempts, "totalAttempts", status, "firstFailedAt", "lastFailedAt")
       VALUES ($1, $2, 0, 3, $3, 'PROJECTION', 1, 1, 'QUARANTINED', $4, $4)`,
      [GROUP, TOPIC, '1'.repeat(64), EVENT_AT],
    );
    const report = await runLoyaltyCutoverReadinessCheck({ env: env() });
    expect(report.status).toBe('NOT_READY');
    expect(report.reasons).toEqual(
      expect.arrayContaining([
        'AUDIT_RECEIPT_COUNT_MISMATCH',
        'AUDIT_RECEIPT_FINGERPRINT_MISMATCH',
        'SLOT_MISMATCH',
        'DLQ_OPEN',
      ]),
    );
  });
});
