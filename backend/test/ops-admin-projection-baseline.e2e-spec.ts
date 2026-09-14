import { createHash } from 'node:crypto';
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { opsAdminProjectionDataSourceOptions } from '../src/database/ops-admin-projection-data-source.options';
import {
  OPS_ADMIN_PROJECTION_READER_ROLE,
  provisionOpsAdminProjectionReaderRole,
} from '../src/database/provision-ops-admin-projection-reader-role';
import { OPS_ADMIN_PROJECTION_RUNTIME_ROLE } from '../src/database/provision-ops-admin-projection-runtime-role';
import {
  serializeOpsAdminBaselineReport,
  transferOpsAdminProjectionBaseline,
} from '../src/database/transfer-ops-admin-projection-baseline';

const READER_PASSWORD = 'ops_admin_proj_reader_ci_password_20260914';
const SECRET = 'SECRET-PII-TITLE-SHOULD-NOT-LEAK';

function ownerUrl(): string {
  const url =
    process.env.OPS_ADMIN_PROJECTION_DATABASE_OWNER_URL ??
    process.env.DATABASE_URL ??
    process.env.OPS_ADMIN_PROJECTION_DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for the baseline proof');
  }
  return url;
}

function coreDatabaseUrl(): string {
  const url =
    process.env.OPS_ADMIN_PROJECTION_CORE_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to prove Core CONNECT denial');
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

function maintenanceUrl(url: string): string {
  return rewriteDatabase(url, 'postgres');
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

function sha256(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

function writeBackup(contents: string, ageMs = 0): string {
  const dir = mkdtempSync(join(tmpdir(), 'ops-admin-baseline-e2e-'));
  const path = join(dir, 'backup.dump');
  writeFileSync(path, contents);
  if (ageMs !== 0) {
    const at = (Date.now() - ageMs) / 1000;
    utimesSync(path, at, at);
  }
  return path;
}

function expectDenied(error: unknown): void {
  expect(error).toEqual(
    expect.objectContaining({
      code: expect.stringMatching(/^(42501|3F000|3D000|28000|28P01|25006)$/),
    }),
  );
  const message = error instanceof Error ? error.message : String(error);
  expect(message).not.toMatch(/postgresql:\/\//i);
  expect(message).not.toContain(READER_PASSWORD);
  expect(message).not.toContain(SECRET);
}

async function deny(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
    throw new Error('expected PostgreSQL to deny the operation');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'expected PostgreSQL to deny the operation'
    ) {
      throw error;
    }
    expectDenied(error);
  }
}

async function createCoreSource(client: Client): Promise<void> {
  await client.query('CREATE SCHEMA ops');
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
    attachments jsonb,
    "senderId" text,
    "senderLabelFa" text,
    "sourceType" ops."CartableSourceType",
    "sourceId" text,
    "conversationId" text,
    status ops."CartableStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" text,
    "transferredToId" text,
    "resolvedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    version int NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
  )`);
  await client.query(
    'CREATE TABLE migrations (id serial PRIMARY KEY, timestamp bigint, name text)',
  );
  await client.query(
    `INSERT INTO migrations (timestamp, name) VALUES (1, 'CoreCartable')`,
  );
  await client.query(
    `INSERT INTO ops.cartable_tasks (
      id, "assigneeId", category, title, description, "sourceType", "sourceId",
      status, version, "createdAt"
    ) VALUES
      ('task-b', 'assignee-1', 'ADMIN', $1, $1, NULL, NULL, 'OPEN', 1, '2026-01-01T00:00:00.000Z'),
      ('task-a', 'assignee-1', 'AGENCY', $1, $1, 'AGENCY_REQUEST', 'src-1', 'OPEN', 2, '2026-02-01T00:00:00.000Z')`,
    [SECRET],
  );
}

describe('Ops/Admin projection baseline tooling (PostgreSQL)', () => {
  const suffix = `${Date.now()}`;
  const sourceName = `blujet_core_base_${suffix}`;
  const targetName = `blujet_ops_admin_base_${suffix}`;
  const migrateName = `blujet_ops_admin_mig_${suffix}`;
  let admin: Client;
  let source: Client;
  let target: Client;
  let coreOwner: Client;
  let reader: Client | undefined;
  let sourceUrl: string;
  let targetUrl: string;

  beforeAll(async () => {
    const root = ownerUrl();
    admin = new Client({ connectionString: maintenanceUrl(root) });
    await admin.connect();
    await dropDatabase(admin, sourceName);
    await dropDatabase(admin, targetName);
    await dropDatabase(admin, migrateName);
    await admin.query(`CREATE DATABASE ${quoteIdent(sourceName)}`);
    await admin.query(`CREATE DATABASE ${quoteIdent(targetName)}`);
    await admin.query(`CREATE DATABASE ${quoteIdent(migrateName)}`);

    sourceUrl = rewriteDatabase(root, sourceName);
    targetUrl = rewriteDatabase(root, targetName);
    source = new Client({ connectionString: sourceUrl });
    await source.connect();
    await createCoreSource(source);

    const migrations = new DataSource(
      opsAdminProjectionDataSourceOptions(targetUrl),
    );
    await migrations.initialize();
    await migrations.runMigrations();
    await migrations.destroy();
    target = new Client({ connectionString: targetUrl });
    await target.connect();
    await target.query(
      `INSERT INTO ops.cartable_projection_event_receipts
        ("eventId", fingerprint, "taskId", "taskVersion")
       VALUES (
         '11111111-1111-4111-8111-111111111111',
         'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         'task-control',
         1
       )`,
    );

    coreOwner = new Client({ connectionString: coreDatabaseUrl() });
    await coreOwner.connect();
  }, 60000);

  afterAll(async () => {
    if (reader) await reader.end().catch(() => undefined);
    if (target) {
      await target
        .query(
          `DROP OWNED BY ${quoteIdent(OPS_ADMIN_PROJECTION_READER_ROLE)} CASCADE`,
        )
        .catch(() => undefined);
      await target.end().catch(() => undefined);
    }
    if (source) await source.end().catch(() => undefined);
    if (coreOwner) await coreOwner.end().catch(() => undefined);
    if (admin) {
      await dropDatabase(admin, sourceName).catch(() => undefined);
      await dropDatabase(admin, targetName).catch(() => undefined);
      await dropDatabase(admin, migrateName).catch(() => undefined);
      await admin.end().catch(() => undefined);
    }
  });

  it('rejects missing, stale and checksum-mismatched backup artifacts', async () => {
    await expect(
      transferOpsAdminProjectionBaseline({
        source,
        target,
        apply: true,
        batchSize: 50,
      }),
    ).rejects.toThrow('verified backup artifact');
    await expect(
      transferOpsAdminProjectionBaseline({
        source,
        target,
        apply: true,
        batchSize: 50,
        backupPath: join(tmpdir(), 'ops-admin-missing.dump'),
        backupSha256: 'a'.repeat(64),
      }),
    ).rejects.toThrow('missing');
    const stale = writeBackup('payload', 25 * 60 * 60 * 1000);
    await expect(
      transferOpsAdminProjectionBaseline({
        source,
        target,
        apply: true,
        batchSize: 50,
        backupPath: stale,
        backupSha256: sha256('payload'),
      }),
    ).rejects.toThrow('stale');
    const fresh = writeBackup('payload');
    await expect(
      transferOpsAdminProjectionBaseline({
        source,
        target,
        apply: true,
        batchSize: 50,
        backupPath: fresh,
        backupSha256: 'b'.repeat(64),
      }),
    ).rejects.toThrow('does not match');
    const empty = await target.query(
      'SELECT count(*)::int AS count FROM ops.cartable_tasks',
    );
    expect(empty.rows[0]?.count).toBe(0);
  });

  it('copies an empty target with two-hash parity and rolls back mismatches', async () => {
    const backup = writeBackup('verified-ops-admin-baseline');
    const report = await transferOpsAdminProjectionBaseline({
      source,
      target,
      apply: true,
      batchSize: 1,
      backupPath: backup,
      backupSha256: sha256('verified-ops-admin-baseline'),
    });
    expect(report.status).toBe('PASS');
    expect(report.sourceCount).toBe('2');
    expect(report.targetCount).toBe('2');
    expect(report.sourceHashA).toBe(report.targetHashA);
    expect(report.sourceHashB).toBe(report.targetHashB);
    expect(report.sourceHashA).not.toBe(report.sourceHashB);
    const serialized = serializeOpsAdminBaselineReport(report);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('assignee-1');
    expect(serialized).not.toContain('src-1');
    expect(serialized).not.toContain('task-a');
    const content = await target.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'ops' AND table_name = 'cartable_tasks'
         AND column_name IN ('title', 'description', 'attachments')`,
    );
    expect(content.rows).toEqual([]);

    const reconcile = await transferOpsAdminProjectionBaseline({
      source,
      target,
      apply: false,
      batchSize: 50,
    });
    expect(reconcile.status).toBe('PASS');
    expect(reconcile.mode).toBe('reconcile');

    await expect(
      transferOpsAdminProjectionBaseline({
        source,
        target,
        apply: true,
        batchSize: 50,
        backupPath: backup,
        backupSha256: sha256('verified-ops-admin-baseline'),
      }),
    ).rejects.toThrow('target must be empty');

    await target.query('TRUNCATE ops.cartable_tasks');
    await target.query(`CREATE FUNCTION ops.corrupt_baseline() RETURNS trigger AS $$
      BEGIN
        NEW."assigneeId" := 'corrupted';
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`);
    await target.query(
      `CREATE TRIGGER corrupt_baseline BEFORE INSERT ON ops.cartable_tasks
       FOR EACH ROW EXECUTE FUNCTION ops.corrupt_baseline()`,
    );
    await expect(
      transferOpsAdminProjectionBaseline({
        source,
        target,
        apply: true,
        batchSize: 50,
        backupPath: backup,
        backupSha256: sha256('verified-ops-admin-baseline'),
      }),
    ).rejects.toThrow('checksum mismatch');
    const rolledBack = await target.query(
      'SELECT count(*)::int AS count FROM ops.cartable_tasks',
    );
    expect(rolledBack.rows[0]?.count).toBe(0);
    await target.query('DROP TRIGGER corrupt_baseline ON ops.cartable_tasks');
    await target.query('DROP FUNCTION ops.corrupt_baseline()');

    const restored = await transferOpsAdminProjectionBaseline({
      source,
      target,
      apply: true,
      batchSize: 50,
      backupPath: backup,
      backupSha256: sha256('verified-ops-admin-baseline'),
    });
    expect(restored.status).toBe('PASS');
  });

  it('provisions an exact-column HTTP reader and denies writer/control/Core access', async () => {
    await provisionOpsAdminProjectionReaderRole(
      target,
      READER_PASSWORD,
      targetName,
    );
    expect(OPS_ADMIN_PROJECTION_READER_ROLE).not.toBe(
      OPS_ADMIN_PROJECTION_RUNTIME_ROLE,
    );
    const readerUrl = (() => {
      const parsed = new URL(targetUrl);
      parsed.username = OPS_ADMIN_PROJECTION_READER_ROLE;
      parsed.password = READER_PASSWORD;
      return parsed.toString();
    })();
    reader = new Client({ connectionString: readerUrl });
    await reader.connect();
    const readOnly = await reader.query('SHOW transaction_read_only');
    expect(readOnly.rows[0]?.transaction_read_only).toBe('on');
    const allowed = await reader.query(
      `SELECT id, "assigneeId", category, "sourceType", "sourceId", status,
              "resolvedAt", "readAt", "createdAt"
       FROM ops.cartable_tasks ORDER BY id`,
    );
    expect(allowed.rows).toHaveLength(2);
    await deny(() =>
      reader!.query('SELECT "taskVersion" FROM ops.cartable_tasks'),
    );
    await deny(() =>
      reader!.query('SELECT * FROM ops.cartable_projection_event_receipts'),
    );
    await deny(() =>
      reader!.query('SELECT * FROM ops.kafka_consumer_checkpoints'),
    );
    await deny(() =>
      reader!.query(
        `INSERT INTO ops.cartable_tasks (id, "assigneeId", category, status)
         VALUES ('x', 'y', 'ADMIN', 'OPEN')`,
      ),
    );
    await deny(() => reader!.query('CREATE TABLE ops.forbidden (id text)'));
    await deny(() => reader!.query('CREATE SEQUENCE ops.forbidden_seq'));
    const coreConnect = await coreOwner.query(
      `SELECT has_database_privilege($1, current_database(), 'CONNECT') AS allowed`,
      [OPS_ADMIN_PROJECTION_READER_ROLE],
    );
    expect(coreConnect.rows[0]).toEqual({ allowed: false });
    const coreUrl = new URL(coreDatabaseUrl());
    coreUrl.username = OPS_ADMIN_PROJECTION_READER_ROLE;
    coreUrl.password = READER_PASSWORD;
    const coreReader = new Client({ connectionString: coreUrl.toString() });
    await deny(() => coreReader.connect());
    await coreReader.end().catch(() => undefined);
  });

  it('restores standalone Ops/Admin migrations with schema parity', async () => {
    const migrateUrl = rewriteDatabase(ownerUrl(), migrateName);
    const dataSource = new DataSource(
      opsAdminProjectionDataSourceOptions(migrateUrl),
    );
    await dataSource.initialize();
    await dataSource.runMigrations();
    const expected = await schemaSnapshot(migrateUrl);
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    await dataSource.runMigrations();
    const restored = await schemaSnapshot(migrateUrl);
    expect(restored).toEqual(expected);
    await dataSource.destroy();
  });
});

async function schemaSnapshot(url: string): Promise<unknown> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'ops' ORDER BY table_name`,
    );
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'ops' AND table_name = 'cartable_tasks'
       ORDER BY ordinal_position`,
    );
    return {
      tables: tables.rows.map((row) => String(row.table_name)),
      columns: columns.rows.map((row) => String(row.column_name)),
    };
  } finally {
    await client.end();
  }
}
