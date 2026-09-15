import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  connectOpsAdminCutoverReadClient,
  evaluateOpsAdminCutoverReadiness,
  runOpsAdminCutoverReadinessCheck,
  serializeOpsAdminCutoverReport,
} from '../src/database/check-ops-admin-projection-cutover-readiness';
import { opsAdminProjectionDataSourceOptions } from '../src/database/ops-admin-projection-data-source.options';

const GROUP = 'blujet.ops-admin.cartable';
const TOPIC = 'blujet.ops-admin.cartable.v1';
const SECRET = 'SECRET-PII-SHOULD-NOT-LEAK';

function ownerUrl(): string {
  const url =
    process.env.OPS_ADMIN_PROJECTION_DATABASE_OWNER_URL ??
    process.env.DATABASE_URL ??
    process.env.OPS_ADMIN_PROJECTION_DATABASE_URL;
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

async function createCoreSource(client: Client): Promise<void> {
  await client.query('CREATE SCHEMA ops');
  await client.query('CREATE SCHEMA orders');
  await client.query(
    `CREATE TYPE ops."CartableCategory" AS ENUM('ADMIN', 'AGENCY', 'MANAGER')`,
  );
  await client.query(
    `CREATE TYPE ops."CartableSourceType" AS ENUM('MANAGER_MESSAGE', 'MANAGER_REFERRAL', 'AGENCY_REQUEST', 'CHAIR_PERMISSION', 'EMPLOYEE_MESSAGE')`,
  );
  await client.query(
    `CREATE TYPE ops."CartableStatus" AS ENUM('OPEN', 'APPROVED', 'REJECTED', 'TRANSFERRED')`,
  );
  await client.query(`CREATE TABLE ops.cartable_tasks (
    id text PRIMARY KEY,
    "assigneeId" text NOT NULL,
    category ops."CartableCategory" NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    "sourceType" ops."CartableSourceType",
    "sourceId" text,
    status ops."CartableStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    version int NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
  )`);
  await client.query(`CREATE TABLE orders.commerce_outbox_events (
    id text PRIMARY KEY,
    producer text NOT NULL,
    "idempotencyKey" text NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "deadLetterAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT now()
  )`);
}

async function insertTask(
  client: Client,
  options: {
    id: string;
    version: number;
    status?: string;
    createdAt: string;
    title?: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO ops.cartable_tasks (
      id, "assigneeId", category, title, description, "sourceType", "sourceId",
      status, version, "createdAt"
    ) VALUES ($1, 'assignee-1', 'ADMIN', $2, $2, NULL, NULL, $3, $4, $5)`,
    [
      options.id,
      options.title ?? SECRET,
      options.status ?? 'OPEN',
      options.version,
      options.createdAt,
    ],
  );
}

async function insertProjectionTask(
  client: Client,
  options: { id: string; version: number; status?: string; createdAt: string },
): Promise<void> {
  await client.query(
    `INSERT INTO ops.cartable_tasks (
      id, "assigneeId", category, "sourceType", "sourceId", status,
      "taskVersion", "createdAt"
    ) VALUES ($1, 'assignee-1', 'ADMIN', NULL, NULL, $2, $3, $4)`,
    [options.id, options.status ?? 'OPEN', options.version, options.createdAt],
  );
}

async function insertCheckpoint(
  client: Client,
  partition: number,
  nextOffset: string,
  highWatermark: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO ops.kafka_consumer_checkpoints
      ("consumerGroup", topic, "partition", "nextOffset", "highWatermark")
     VALUES ($1, $2, $3, $4, $5)`,
    [GROUP, TOPIC, partition, nextOffset, highWatermark],
  );
}

describe('Ops/Admin projection cutover readiness (PostgreSQL)', () => {
  const suffix = `${Date.now()}`;
  const sourceName = `blujet_core_cutover_${suffix}`;
  const targetName = `blujet_ops_admin_cutover_${suffix}`;
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
    source = new Client({
      connectionString: sourceUrl,
    });
    await source.connect();
    await createCoreSource(source);
    const targetUrl = rewriteDatabase(root, targetName);
    const migrations = new DataSource(
      opsAdminProjectionDataSourceOptions(targetUrl),
    );
    await migrations.initialize();
    await migrations.runMigrations();
    await migrations.destroy();
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
      'TRUNCATE ops.cartable_tasks, orders.commerce_outbox_events',
    );
    await target.query(
      'TRUNCATE ops.cartable_tasks, ops.kafka_consumer_checkpoints, ops.kafka_processing_failures',
    );
  });

  it('enforces session read-only UTC timeouts on the cutover client', async () => {
    const client = await connectOpsAdminCutoverReadClient(sourceUrl);
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
    const result = await runOpsAdminCutoverReadinessCheck({
      env: { OPS_ADMIN_CUTOVER_CHECK_ENABLED: 'false' },
      connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(result.report.status).toBe('DISABLED');
    expect(result.exitCode).toBe(0);
  });

  it('reports READY for matching paged cartable rows, drained outbox and caught-up checkpoints', async () => {
    await insertTask(source, {
      id: 'task-a',
      version: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await insertTask(source, {
      id: 'task-b',
      version: 1,
      createdAt: '2026-02-01T00:00:00.000Z',
    });
    await insertProjectionTask(target, {
      id: 'task-a',
      version: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await insertProjectionTask(target, {
      id: 'task-b',
      version: 1,
      createdAt: '2026-02-01T00:00:00.000Z',
    });
    await source.query(
      `INSERT INTO orders.commerce_outbox_events (id, producer, "idempotencyKey", "deliveredAt")
       VALUES ('out-1', 'core-ops', 'cartable-projected:task-a:v2', now())`,
    );
    await source.query(
      `INSERT INTO orders.commerce_outbox_events (id, producer, "idempotencyKey")
       VALUES ('out-other', 'core-ticketing', 'unrelated')`,
    );
    await target.query(
      `INSERT INTO ops.kafka_processing_failures (
        "consumerGroup", topic, "partition", "offset", fingerprint, stage,
        attempts, "totalAttempts", status, "firstFailedAt", "lastFailedAt", "resolvedAt"
      ) VALUES (
        $1, $2, 0, 1, $3, 'PROJECTION', 1, 1, 'RESOLVED', now(), now(), now()
      )`,
      [GROUP, TOPIC, 'a'.repeat(64)],
    );
    await insertCheckpoint(target, 0, '5', '5');
    await insertCheckpoint(target, 1, '3', '3');
    await insertCheckpoint(target, 2, '9', '9');

    const report = await evaluateOpsAdminCutoverReadiness({
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
    const serialized = serializeOpsAdminCutoverReport(report);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('task-a');
    expect(serialized).not.toContain('assignee-1');
    expect(serialized).not.toMatch(/postgresql:\/\//i);
  });

  it('reports NOT_READY for cartable, outbox, DLQ and checkpoint failures', async () => {
    await insertTask(source, {
      id: 'task-a',
      version: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await insertProjectionTask(target, {
      id: 'task-a',
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await insertProjectionTask(target, {
      id: 'task-extra',
      version: 1,
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await source.query(
      `INSERT INTO orders.commerce_outbox_events (id, producer, "idempotencyKey")
       VALUES ('pending-1', 'core-ops', 'cartable-projected:task-a:v3')`,
    );
    await target.query(
      `INSERT INTO ops.kafka_processing_failures (
        "consumerGroup", topic, "partition", "offset", fingerprint, stage,
        attempts, "totalAttempts", status, "firstFailedAt", "lastFailedAt"
      ) VALUES (
        $1, $2, 0, 8, $3, 'TRANSPORT', 1, 1, 'QUARANTINED', now(), now()
      )`,
      [GROUP, TOPIC, 'b'.repeat(64)],
    );
    await insertCheckpoint(target, 0, '1', null);
    await insertCheckpoint(target, 9, '1', '4');

    const report = await evaluateOpsAdminCutoverReadiness({
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
        'CARTABLE_COUNT_MISMATCH',
        'CARTABLE_STALE',
        'CARTABLE_UNEXPECTED',
        'OUTBOX_PENDING',
        'DLQ_OPEN',
        'CHECKPOINT_MISSING',
        'CHECKPOINT_UNEXPECTED',
        'CHECKPOINT_WATERMARK_MISSING',
      ]),
    );
    expect(serializeOpsAdminCutoverReport(report)).not.toContain(SECRET);
  });
});
