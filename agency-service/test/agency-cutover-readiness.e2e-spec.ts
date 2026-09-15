import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  classifyAgencyCutoverDatabaseUrls,
  connectAgencyCutoverReadClient,
  evaluateAgencyCutoverReadiness,
  runAgencyCutoverReadinessCheck,
  serializeAgencyCutoverReport,
} from '../src/check-agency-projection-cutover-readiness';
import { agencyMigrationDataSourceOptions } from '../src/database/data-source.options';

const GROUP = 'blujet-agency-projection-v1';
const TOPIC = 'blujet.events.v1';
const SECRET = 'SECRET-PII-SHOULD-NOT-LEAK';
const FINGERPRINT = 'a'.repeat(64);

function ownerUrl(): string {
  const url = process.env.AGENCY_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('AGENCY_DATABASE_URL is required');
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

async function migrateAgency(url: string): Promise<void> {
  const migrations = new DataSource(agencyMigrationDataSourceOptions(url));
  await migrations.initialize();
  await migrations.runMigrations();
  await migrations.destroy();
}

async function installOutbox(client: Client): Promise<void> {
  await client.query('CREATE SCHEMA IF NOT EXISTS orders');
  await client.query(`CREATE TABLE IF NOT EXISTS orders.commerce_outbox_events (
    id text PRIMARY KEY,
    producer text NOT NULL,
    "deliveredAt" timestamptz,
    "deadLetterAt" timestamptz,
    "claimedAt" timestamptz
  )`);
}

async function seedBusiness(client: Client, userId: string): Promise<void> {
  await client.query(
    `INSERT INTO agency.agency_profiles
      ("userId", "licenseNo", "managerName", phone, email, city, address, "joinedAt", version)
     VALUES ($1, 'LIC-1', $2, '02100000000', 'a@example.invalid', 'تهران', 'addr',
       '2026-09-15T00:00:00.000Z', 1)`,
    [userId, SECRET],
  );
  await client.query(
    `INSERT INTO agency.agency_invoices
      (id, "agencyId", "invoiceNo", "issuedById", "issuedAt", "dueAt", "amountIrr", status, version)
     VALUES ($1, $2, 'INV-1', 'staff-1', '2026-09-15T00:00:00.000Z',
       '2026-10-15T00:00:00.000Z', 1000, 'UNPAID', 1)`,
    [`inv-${userId}`, userId],
  );
  await client.query(
    `INSERT INTO agency.agency_credit_requests
      (id, "agencyId", "requestedLimitIrr", status, "createdAt", version)
     VALUES ($1, $2, 5000, 'PENDING', '2026-09-15T00:00:00.000Z', 1)`,
    [`cr-${userId}`, userId],
  );
}

async function seedSlotsAndReceipts(
  client: Client,
  userId: string,
): Promise<void> {
  const rows = [
    ['AgencyProfile', userId],
    ['AgencyInvoice', `inv-${userId}`],
    ['AgencyCreditRequest', `cr-${userId}`],
  ] as const;
  for (const [aggregateType, aggregateId] of rows) {
    await client.query(
      `INSERT INTO agency.agency_projection_slots
        ("aggregateType", "aggregateId", "recordVersion", "semanticFingerprint", "auditId")
       VALUES ($1, $2, 1, $3, $4)`,
      [aggregateType, aggregateId, FINGERPRINT, randomUUID()],
    );
    await client.query(
      `INSERT INTO agency.agency_projection_event_receipts
        ("eventId", "envelopeFingerprint", "semanticFingerprint",
         "aggregateType", "aggregateId", "recordVersion", "auditId")
       VALUES ($1, $2, $2, $3, $4, 1, $5)`,
      [randomUUID(), FINGERPRINT, aggregateType, aggregateId, randomUUID()],
    );
  }
}

async function seedCheckpoints(
  client: Client,
  partitions: readonly number[],
  nextOffset = '4',
  highWatermark: string | null = '4',
): Promise<void> {
  for (const partition of partitions) {
    await client.query(
      `INSERT INTO agency.kafka_consumer_checkpoints
        ("consumerGroup", topic, "partition", "nextOffset", "highWatermark")
       VALUES ($1, $2, $3, $4, $5)`,
      [GROUP, TOPIC, partition, nextOffset, highWatermark],
    );
  }
}

describe('Agency cutover readiness gate (PostgreSQL)', () => {
  const suffix = `${Date.now()}`;
  const sourceName = `blujet_core_cutover_${suffix}_test`;
  const targetName = `blujet_agency_cutover_${suffix}_test`;
  const userId = 'agency-cutover-1';
  let admin: Client;
  let sourceOwner: Client;
  let targetOwner: Client;
  let sourceUrl: string;
  let targetUrl: string;
  let root: string;

  beforeAll(async () => {
    root = ownerUrl();
    sourceUrl = rewriteDatabase(root, sourceName);
    targetUrl = rewriteDatabase(root, targetName);
    admin = new Client({ connectionString: rewriteDatabase(root, 'postgres') });
    await admin.connect();
    await dropDatabase(admin, sourceName);
    await dropDatabase(admin, targetName);
    await admin.query(`CREATE DATABASE ${quoteIdent(sourceName)}`);
    await admin.query(`CREATE DATABASE ${quoteIdent(targetName)}`);
    await migrateAgency(sourceUrl);
    await migrateAgency(targetUrl);
    sourceOwner = new Client({ connectionString: sourceUrl });
    targetOwner = new Client({ connectionString: targetUrl });
    await sourceOwner.connect();
    await targetOwner.connect();
    await installOutbox(sourceOwner);
  }, 60000);

  beforeEach(async () => {
    await sourceOwner.query(`TRUNCATE
      agency.kafka_consumer_checkpoints,
      agency.kafka_processing_failures,
      agency.agency_projection_event_receipts,
      agency.agency_projection_slots,
      agency.agency_invoices,
      agency.agency_credit_requests,
      agency.agency_profiles
      RESTART IDENTITY CASCADE`);
    await targetOwner.query(`TRUNCATE
      agency.kafka_consumer_checkpoints,
      agency.kafka_processing_failures,
      agency.agency_projection_event_receipts,
      agency.agency_projection_slots,
      agency.agency_invoices,
      agency.agency_credit_requests,
      agency.agency_profiles
      RESTART IDENTITY CASCADE`);
    await sourceOwner.query('TRUNCATE orders.commerce_outbox_events');
    await seedBusiness(sourceOwner, userId);
    await seedBusiness(targetOwner, userId);
    await seedSlotsAndReceipts(targetOwner, userId);
    await seedCheckpoints(targetOwner, [0, 1, 2]);
  });

  afterAll(async () => {
    await sourceOwner?.end().catch(() => undefined);
    await targetOwner?.end().catch(() => undefined);
    if (admin) {
      await dropDatabase(admin, sourceName).catch(() => undefined);
      await dropDatabase(admin, targetName).catch(() => undefined);
      await admin.end().catch(() => undefined);
    }
  });

  async function evaluate(): Promise<
    Awaited<ReturnType<typeof evaluateAgencyCutoverReadiness>>
  > {
    const source = await connectAgencyCutoverReadClient(sourceUrl);
    const target = await connectAgencyCutoverReadClient(targetUrl);
    try {
      return await evaluateAgencyCutoverReadiness({
        source,
        target,
        kafkaGroupId: GROUP,
        kafkaTopic: TOPIC,
        expectedPartitions: [0, 1, 2],
        batchSize: 100,
      });
    } finally {
      await source.end();
      await target.end();
    }
  }

  it('reports READY for matching projections, drained outbox and caught-up checkpoints', async () => {
    const report = await evaluate();
    expect(report.status).toBe('READY');
    expect(report.checksumEqual).toBe(true);
    expect(report.reasons).toEqual([]);
    const serialized = serializeAgencyCutoverReport(report);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toMatch(/postgresql:\/\//i);
    expect(serialized).not.toContain(userId);
  });

  it('fails closed on row count mismatch', async () => {
    await sourceOwner.query(
      `INSERT INTO agency.agency_profiles
        ("userId", "licenseNo", "managerName", phone, email, city, address)
       VALUES ('extra-core', 'LIC-2', $1, '0211', 'b@example.invalid', 'x', 'y')`,
      [SECRET],
    );
    const report = await evaluate();
    expect(report.status).toBe('NOT_READY');
    expect(report.reasons).toContain('PROJECTION_COUNT_MISMATCH');
    expect(report.checksumEqual).toBe(false);
  });

  it('fails closed on checksum mismatch with equal counts', async () => {
    await targetOwner.query(
      `UPDATE agency.agency_profiles SET email = 'changed@example.invalid'
       WHERE "userId" = $1`,
      [userId],
    );
    const report = await evaluate();
    expect(report.status).toBe('NOT_READY');
    expect(report.reasons).toContain('PROJECTION_CHECKSUM_MISMATCH');
    expect(serializeAgencyCutoverReport(report)).not.toContain(
      'changed@example.invalid',
    );
  });

  it('fails closed on a source outbox backlog', async () => {
    await sourceOwner.query(
      `INSERT INTO orders.commerce_outbox_events (id, producer)
       VALUES ('evt-1', 'core-agency')`,
    );
    const report = await evaluate();
    expect(report.reasons).toContain('OUTBOX_PENDING');
  });

  it('fails closed on checkpoint lag', async () => {
    await targetOwner.query(
      `UPDATE agency.kafka_consumer_checkpoints
       SET "nextOffset" = 1, "highWatermark" = 9 WHERE "partition" = 0`,
    );
    const report = await evaluate();
    expect(report.reasons).toContain('CHECKPOINT_LAG');
  });

  it('fails closed on an unresolved DLQ row', async () => {
    await targetOwner.query(
      `INSERT INTO agency.kafka_processing_failures (
         "consumerGroup", topic, "partition", "offset", fingerprint, stage,
         attempts, "totalAttempts", status, "firstFailedAt", "lastFailedAt"
       ) VALUES ($1, $2, 0, 1, $3, 'PROJECTION', 1, 1, 'RETRYING', now(), now())`,
      [GROUP, TOPIC, FINGERPRINT],
    );
    const report = await evaluate();
    expect(report.reasons).toContain('DLQ_OPEN');
  });

  it('fails closed when an expected partition is missing', async () => {
    await targetOwner.query(
      `DELETE FROM agency.kafka_consumer_checkpoints WHERE "partition" = 2`,
    );
    const report = await evaluate();
    expect(report.reasons).toContain('CHECKPOINT_MISSING');
  });

  it('fails closed for source/target URL mix-up without printing credentials', async () => {
    const mixed = await runAgencyCutoverReadinessCheck({
      env: {
        TZ: 'UTC',
        AGENCY_CUTOVER_CHECK_ENABLED: 'true',
        AGENCY_CUTOVER_SOURCE_DATABASE_URL: targetUrl,
        AGENCY_CUTOVER_TARGET_DATABASE_URL: sourceUrl,
        AGENCY_CUTOVER_KAFKA_GROUP_ID: GROUP,
        AGENCY_CUTOVER_KAFKA_TOPIC: TOPIC,
        AGENCY_CUTOVER_EXPECTED_PARTITIONS: '0,1,2',
      },
      connect: connectAgencyCutoverReadClient,
    });
    expect(mixed.exitCode).toBe(2);
    expect(mixed.report.reasons).toEqual(
      expect.arrayContaining([
        'INVALID_SOURCE_DATABASE',
        'INVALID_TARGET_DATABASE',
      ]),
    );
    expect(classifyAgencyCutoverDatabaseUrls(sourceUrl, targetUrl)).toEqual([]);
    expect(serializeAgencyCutoverReport(mixed.report)).not.toMatch(
      /postgresql:\/\//i,
    );
  });

  it('rejects writes in the read-only cutover session', async () => {
    const client = await connectAgencyCutoverReadClient(targetUrl);
    try {
      await client.query(
        `INSERT INTO agency.agency_profiles
          ("userId", "licenseNo", "managerName", phone, email, city, address)
         VALUES ('injected', 'x', 'y', 'z', 'e@x', 'c', 'a')`,
      );
      throw new Error('expected PostgreSQL to deny the write');
    } catch (error: unknown) {
      expect(
        typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          typeof error.code === 'string' &&
          /^(25006|42501)$/.test(error.code),
      ).toBe(true);
    }
    await client.end();
  });
});
