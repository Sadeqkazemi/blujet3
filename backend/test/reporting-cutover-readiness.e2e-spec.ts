import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  connectReportingCutoverReadClient,
  evaluateReportingCutoverReadiness,
  runReportingCutoverReadinessCheck,
  serializeReportingCutoverReport,
} from '../src/database/check-reporting-projection-cutover-readiness';
import { reportingDataSourceOptions } from '../src/database/reporting-data-source.options';

const GROUP = 'blujet-reporting-v1';
const TOPIC = 'blujet.events.v1';
const SECRET = 'SECRET-PII-SHOULD-NOT-LEAK';
const FINGERPRINT = 'a'.repeat(64);

function ownerUrl(): string {
  const url =
    process.env.REPORTING_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.REPORTING_DATABASE_OWNER_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for the cutover-readiness proof');
  }
  return url;
}

function rewriteDatabase(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${databaseName}`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function dropDatabase(admin: Client, name: string): Promise<void> {
  await admin.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [name],
  );
  await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)}`);
}

async function migrateReporting(url: string): Promise<void> {
  const migrations = new DataSource(reportingDataSourceOptions(url));
  await migrations.initialize();
  await migrations.runMigrations();
  await migrations.destroy();
}

async function insertProjection(
  client: Client,
  options: {
    orderId: string;
    eventId: string;
    version?: number;
    occurredAt?: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO reporting.core_itinerary_event_projections (
      "orderId", "eventType", "eventId", fingerprint, "orderVersion",
      currency, payload, "occurredAt", "createdAt", "updatedAt"
    ) VALUES ($1, 'OrderCreated', $2, $3, $4, 'IRR', $5::jsonb, $6, $6, $6)`,
    [
      options.orderId,
      options.eventId,
      FINGERPRINT,
      options.version ?? 1,
      JSON.stringify({ note: SECRET }),
      options.occurredAt ?? '2026-01-01T00:00:00.000Z',
    ],
  );
}

async function insertReceipt(
  client: Client,
  options: { orderId: string; eventId: string; version?: number },
): Promise<void> {
  await client.query(
    `INSERT INTO reporting.core_itinerary_event_receipts (
      "eventId", fingerprint, "orderId", "eventType", "orderVersion", "receivedAt"
    ) VALUES ($1, $2, $3, 'OrderCreated', $4, '2026-01-01T00:00:00.000Z')`,
    [options.eventId, FINGERPRINT, options.orderId, options.version ?? 1],
  );
}

async function insertCheckpoint(
  client: Client,
  partition: number,
  nextOffset: string,
  highWatermark: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO reporting.kafka_consumer_checkpoints
      ("consumerGroup", topic, "partition", "nextOffset", "highWatermark")
     VALUES ($1, $2, $3, $4, $5)`,
    [GROUP, TOPIC, partition, nextOffset, highWatermark],
  );
}

describe('Reporting projection cutover readiness (PostgreSQL)', () => {
  const suffix = `${Date.now()}`;
  const sourceName = `blujet_core_reporting_cutover_${suffix}`;
  const targetName = `blujet_reporting_cutover_${suffix}`;
  let admin: Client;
  let source: Client;
  let target: Client;
  let sourceUrl: string;

  beforeAll(async () => {
    const root = ownerUrl();
    sourceUrl = rewriteDatabase(root, sourceName);
    admin = new Client({
      connectionString: rewriteDatabase(root, 'postgres'),
    });
    await admin.connect();
    await dropDatabase(admin, sourceName);
    await dropDatabase(admin, targetName);
    await admin.query(`CREATE DATABASE ${quoteIdent(sourceName)}`);
    await admin.query(`CREATE DATABASE ${quoteIdent(targetName)}`);
    const targetUrl = rewriteDatabase(root, targetName);
    await migrateReporting(sourceUrl);
    await migrateReporting(targetUrl);
    source = new Client({ connectionString: sourceUrl });
    await source.connect();
    target = new Client({ connectionString: targetUrl });
    await target.connect();
  }, 60000);

  afterAll(async () => {
    if (source) await source.end().catch(() => undefined);
    if (target) await target.end().catch(() => undefined);
    if (admin) {
      await dropDatabase(admin, sourceName).catch(() => undefined);
      await dropDatabase(admin, targetName).catch(() => undefined);
      await admin.end().catch(() => undefined);
    }
  });

  beforeEach(async () => {
    await source.query(
      'TRUNCATE reporting.core_itinerary_event_projections, reporting.core_itinerary_event_receipts, reporting.kafka_consumer_checkpoints, reporting.kafka_processing_failures',
    );
    await target.query(
      'TRUNCATE reporting.core_itinerary_event_projections, reporting.core_itinerary_event_receipts, reporting.kafka_consumer_checkpoints, reporting.kafka_processing_failures',
    );
  });

  it('enforces session read-only UTC timeouts on the cutover client', async () => {
    const client = await connectReportingCutoverReadClient(sourceUrl);
    try {
      const settings = await client.query<{
        default_transaction_read_only: string;
        TimeZone: string;
        statement_timeout: string;
        lock_timeout: string;
      }>(
        `SELECT current_setting('default_transaction_read_only') AS default_transaction_read_only,
                current_setting('TimeZone') AS "TimeZone",
                current_setting('statement_timeout') AS statement_timeout,
                current_setting('lock_timeout') AS lock_timeout`,
      );
      const row = settings.rows[0];
      expect(row?.default_transaction_read_only).toBe('on');
      expect(row?.TimeZone).toBe('UTC');
      expect(['5s', '5000ms', '5000']).toContain(row?.statement_timeout);
      expect(['2s', '2000ms', '2000']).toContain(row?.lock_timeout);
    } finally {
      await client.end();
    }
  });

  it('does not connect when disabled', async () => {
    const connect = jest.fn();
    const result = await runReportingCutoverReadinessCheck({
      env: { REPORTING_CUTOVER_CHECK_ENABLED: 'false' },
      connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(result.report.status).toBe('DISABLED');
    expect(result.exitCode).toBe(0);
  });

  it('reports READY for matching projections, receipts and caught-up checkpoints', async () => {
    const first = '11111111-1111-4111-8111-111111111111';
    const second = '22222222-2222-4222-8222-222222222222';
    await insertReceipt(source, {
      orderId: 'order-a',
      eventId: first,
      version: 2,
    });
    await insertReceipt(source, { orderId: 'order-b', eventId: second });
    await insertProjection(source, {
      orderId: 'order-a',
      eventId: first,
      version: 2,
    });
    await insertProjection(source, { orderId: 'order-b', eventId: second });
    await insertReceipt(target, {
      orderId: 'order-a',
      eventId: first,
      version: 2,
    });
    await insertReceipt(target, { orderId: 'order-b', eventId: second });
    await insertProjection(target, {
      orderId: 'order-a',
      eventId: first,
      version: 2,
    });
    await insertProjection(target, { orderId: 'order-b', eventId: second });
    await source.query(
      `INSERT INTO reporting.kafka_processing_failures (
        "consumerGroup", topic, partition, "offset", fingerprint, stage,
        attempts, "totalAttempts", status, "firstFailedAt", "lastFailedAt",
        "resolvedAt"
      ) VALUES ($1, $2, 0, 1, $3, 'PROJECTION', 1, 1, 'RESOLVED', now(), now(), now())`,
      [GROUP, TOPIC, FINGERPRINT],
    );
    await target.query(
      `INSERT INTO reporting.kafka_processing_failures (
        "consumerGroup", topic, partition, "offset", fingerprint, stage,
        attempts, "totalAttempts", status, "firstFailedAt", "lastFailedAt",
        "resolvedAt"
      ) VALUES ($1, $2, 0, 1, $3, 'PROJECTION', 1, 1, 'RESOLVED', now(), now(), now())`,
      [GROUP, TOPIC, FINGERPRINT],
    );
    await insertCheckpoint(source, 0, '5', '5');
    await insertCheckpoint(source, 1, '3', '3');
    await insertCheckpoint(source, 2, '9', '9');
    await insertCheckpoint(target, 0, '5', '5');
    await insertCheckpoint(target, 1, '3', '3');
    await insertCheckpoint(target, 2, '9', '9');

    const report = await evaluateReportingCutoverReadiness({
      source,
      target,
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 1,
    });
    expect(report.status).toBe('READY');
    expect(report.reasons).toEqual([]);
    expect(report.sourceCount).toBe('2');
    expect(report.maxLag).toBe('0');
    const serialized = serializeReportingCutoverReport(report);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('order-a');
    expect(serialized).not.toContain(first);
    expect(serialized).not.toMatch(/postgresql:\/\//i);
  });

  it('reports NOT_READY for projection, receipt, failure and checkpoint gaps', async () => {
    const first = '33333333-3333-4333-8333-333333333333';
    await insertReceipt(source, {
      orderId: 'order-a',
      eventId: first,
      version: 3,
    });
    await insertProjection(source, {
      orderId: 'order-a',
      eventId: first,
      version: 3,
    });
    await insertReceipt(target, {
      orderId: 'order-a',
      eventId: first,
      version: 1,
    });
    await insertProjection(target, {
      orderId: 'order-a',
      eventId: first,
      version: 1,
    });
    await target.query(
      `INSERT INTO reporting.kafka_processing_failures (
        "consumerGroup", topic, partition, "offset", fingerprint, stage,
        attempts, "totalAttempts", status, "firstFailedAt", "lastFailedAt"
      ) VALUES ($1, $2, 0, 8, $3, 'TRANSPORT', 1, 1, 'QUARANTINED', now(), now())`,
      [GROUP, TOPIC, 'b'.repeat(64)],
    );
    await insertCheckpoint(source, 0, '1', null);
    await insertCheckpoint(source, 9, '1', '4');
    await insertCheckpoint(target, 0, '1', null);
    await insertCheckpoint(target, 9, '1', '4');

    const report = await evaluateReportingCutoverReadiness({
      source,
      target,
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(report.status).toBe('NOT_READY');
    expect(report.reasons).toEqual(
      expect.arrayContaining([
        'PROJECTION_MISMATCH',
        'RECEIPT_MISMATCH',
        'FAILURE_OPEN',
        'CHECKPOINT_MISSING',
        'CHECKPOINT_UNEXPECTED',
        'CHECKPOINT_WATERMARK_MISSING',
      ]),
    );
    expect(serializeReportingCutoverReport(report)).not.toContain(SECRET);
  });
});
