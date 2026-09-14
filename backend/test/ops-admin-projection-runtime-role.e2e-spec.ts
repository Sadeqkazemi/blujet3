import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { opsAdminProjectionDataSourceOptions } from '../src/database/ops-admin-projection-data-source.options';
import {
  OPS_ADMIN_PROJECTION_RUNTIME_ROLE,
  provisionOpsAdminProjectionRuntimeRole,
} from '../src/database/provision-ops-admin-projection-runtime-role';

const PASSWORD = 'ops_admin_proj_runtime_ci_password_20260914';
const CHECKPOINT_DDL = `CREATE TABLE IF NOT EXISTS "ops"."kafka_consumer_checkpoints" (
  "consumerGroup" character varying(128) NOT NULL,
  "topic" character varying(249) NOT NULL,
  "partition" integer NOT NULL,
  "nextOffset" bigint NOT NULL,
  "highWatermark" bigint,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "ops_kafka_consumer_checkpoints_pkey" PRIMARY KEY ("consumerGroup", "topic", "partition"),
  CONSTRAINT "ops_kafka_checkpoint_partition_check" CHECK ("partition" >= 0),
  CONSTRAINT "ops_kafka_checkpoint_offset_check" CHECK ("nextOffset" >= 0),
  CONSTRAINT "ops_kafka_checkpoint_high_watermark_check" CHECK ("highWatermark" IS NULL OR "highWatermark" >= 0)
)`;

function ownerUrl(): string {
  const url =
    process.env.OPS_ADMIN_PROJECTION_DATABASE_OWNER_URL ??
    process.env.OPS_ADMIN_PROJECTION_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'OPS_ADMIN_PROJECTION_DATABASE_OWNER_URL is required for the runtime-role proof',
    );
  }
  return url;
}

function rewriteDatabase(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function maintenanceUrl(url: string): string {
  return rewriteDatabase(url, 'postgres');
}

function runtimeUrl(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.username = OPS_ADMIN_PROJECTION_RUNTIME_ROLE;
  parsed.password = PASSWORD;
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function expectDenied(error: unknown, password: string): void {
  expect(error).toEqual(
    expect.objectContaining({
      code: expect.stringMatching(/^(42501|3F000|3D000|28000|28P01|25006)$/),
    }),
  );
  const message = error instanceof Error ? error.message : String(error);
  expect(message).not.toMatch(/postgresql:\/\//i);
  expect(message).not.toContain(password);
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
    expectDenied(error, PASSWORD);
  }
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

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

describe('Ops/Admin projection runtime role (PostgreSQL)', () => {
  const suffix = `${Date.now()}`;
  const databaseName = `blujet_ops_admin_runtime_${suffix}`;
  const siblingName = `blujet_ops_admin_runtimex_${suffix}`;
  let admin: Client;
  let owner: Client;
  let runtime: Client;

  beforeAll(async () => {
    const source = ownerUrl();
    admin = new Client({ connectionString: maintenanceUrl(source) });
    await admin.connect();
    await dropDatabase(admin, databaseName);
    await dropDatabase(admin, siblingName);
    await admin.query(`CREATE DATABASE ${quoteIdent(databaseName)}`);
    await admin.query(`CREATE DATABASE ${quoteIdent(siblingName)}`);

    const isolatedUrl = rewriteDatabase(source, databaseName);
    const migrations = new DataSource(
      opsAdminProjectionDataSourceOptions(isolatedUrl),
    );
    await migrations.initialize();
    await migrations.runMigrations();
    await migrations.destroy();

    owner = new Client({ connectionString: isolatedUrl });
    await owner.connect();
    await owner.query(CHECKPOINT_DDL);
    await owner.query(`CREATE SCHEMA IF NOT EXISTS identity`);
    await owner.query(
      `CREATE TABLE identity.users (id text PRIMARY KEY, secret text)`,
    );
    await owner.query(
      `INSERT INTO identity.users (id, secret) VALUES ('u1', 'credential-material')`,
    );
    await owner.query(`CREATE TABLE public.secrets (token text)`);
    await owner.query(
      `INSERT INTO public.secrets (token) VALUES ('gateway-secret')`,
    );
    await owner.query(`CREATE SEQUENCE ops.cartable_seq`);
    await owner.query(
      `REVOKE CONNECT ON DATABASE ${quoteIdent(siblingName)} FROM PUBLIC`,
    );
    await owner.query(
      `GRANT CONNECT ON DATABASE ${quoteIdent(siblingName)} TO CURRENT_USER`,
    );

    await provisionOpsAdminProjectionRuntimeRole(owner, PASSWORD, databaseName);
    await provisionOpsAdminProjectionRuntimeRole(owner, PASSWORD, databaseName);

    const ownership = await owner.query(
      `SELECT c.relname
       FROM pg_class c
       JOIN pg_roles r ON r.oid = c.relowner
       WHERE r.rolname = $1
       UNION ALL
       SELECT n.nspname
       FROM pg_namespace n
       JOIN pg_roles r ON r.oid = n.nspowner
       WHERE r.rolname = $1`,
      [OPS_ADMIN_PROJECTION_RUNTIME_ROLE],
    );
    expect(ownership.rows).toEqual([]);
    const memberships = await owner.query(
      `SELECT 1
       FROM pg_auth_members membership
       JOIN pg_roles member ON member.oid = membership.member
       WHERE member.rolname = $1`,
      [OPS_ADMIN_PROJECTION_RUNTIME_ROLE],
    );
    expect(memberships.rows).toEqual([]);

    runtime = new Client({
      connectionString: runtimeUrl(source, databaseName),
    });
    await runtime.connect();
  }, 30000);

  afterAll(async () => {
    if (runtime) await runtime.end().catch(() => undefined);
    if (owner) {
      await owner
        .query(
          `DROP OWNED BY ${quoteIdent(OPS_ADMIN_PROJECTION_RUNTIME_ROLE)} CASCADE`,
        )
        .catch(() => undefined);
      await owner.end().catch(() => undefined);
    }
    if (admin) {
      await dropDatabase(admin, databaseName).catch(() => undefined);
      await dropDatabase(admin, siblingName).catch(() => undefined);
      await admin
        .query(
          `DROP ROLE IF EXISTS ${quoteIdent(OPS_ADMIN_PROJECTION_RUNTIME_ROLE)}`,
        )
        .catch(() => undefined);
      await admin.end().catch(() => undefined);
    }
  });

  it('allows exact DML: tasks and checkpoints may UPDATE, receipts may not', async () => {
    await runtime.query(`INSERT INTO ops.cartable_tasks
      ("id", "assigneeId", "category", "status")
      VALUES ('task-runtime-1', 'operator-1', 'ADMIN', 'OPEN')`);
    await runtime.query(
      `UPDATE ops.cartable_tasks SET "status" = 'APPROVED' WHERE "id" = 'task-runtime-1'`,
    );
    const tasks = await runtime.query(
      `SELECT "id", "status" FROM ops.cartable_tasks WHERE "id" = 'task-runtime-1'`,
    );
    expect(tasks.rows).toEqual([{ id: 'task-runtime-1', status: 'APPROVED' }]);

    await runtime.query(`INSERT INTO ops.cartable_projection_event_receipts
      ("eventId", "fingerprint", "taskId", "taskVersion")
      VALUES (
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'task-runtime-1',
        1
      )`);
    const receipts = await runtime.query(
      `SELECT "taskVersion" FROM ops.cartable_projection_event_receipts`,
    );
    expect(receipts.rows[0]?.taskVersion).toBe(1);
    await deny(() =>
      runtime.query(`UPDATE ops.cartable_projection_event_receipts
        SET "taskVersion" = 2
        WHERE "eventId" = '11111111-1111-1111-1111-111111111111'`),
    );

    await runtime.query(`INSERT INTO ops.kafka_consumer_checkpoints
      ("consumerGroup", "topic", "partition", "nextOffset")
      VALUES ('ops-admin-projection', 'blujet.events.v1', 0, 1)`);
    await runtime.query(`UPDATE ops.kafka_consumer_checkpoints
      SET "nextOffset" = 2
      WHERE "consumerGroup" = 'ops-admin-projection'`);
    const checkpoints = await runtime.query(
      `SELECT "nextOffset" FROM ops.kafka_consumer_checkpoints`,
    );
    expect(checkpoints.rows[0]?.nextOffset).toBe('2');
  });

  it('denies DELETE, TRUNCATE, sequences, DDL, foreign schemas and other databases', async () => {
    await deny(() =>
      runtime.query(`DELETE FROM ops.cartable_tasks WHERE false`),
    );
    await deny(() => runtime.query(`TRUNCATE ops.cartable_tasks`));
    await deny(() =>
      runtime.query(
        `DELETE FROM ops.cartable_projection_event_receipts WHERE false`,
      ),
    );
    await deny(() =>
      runtime.query(`TRUNCATE ops.cartable_projection_event_receipts`),
    );
    await deny(() =>
      runtime.query(`DELETE FROM ops.kafka_consumer_checkpoints WHERE false`),
    );
    await deny(() => runtime.query(`TRUNCATE ops.kafka_consumer_checkpoints`));
    await deny(() =>
      runtime.query(`INSERT INTO public.secrets (token) VALUES ('x')`),
    );
    await deny(() => runtime.query(`SELECT nextval('ops.cartable_seq')`));
    await deny(() => runtime.query(`CREATE TABLE ops.forbidden (id int)`));
    await deny(() =>
      runtime.query(`ALTER TABLE ops.cartable_tasks ADD COLUMN leak text`),
    );
    await deny(() => runtime.query(`DROP TABLE ops.cartable_tasks`));
    await deny(() => runtime.query(`SELECT secret FROM identity.users`));
    await deny(() => runtime.query(`SELECT token FROM public.secrets`));
    await deny(() =>
      runtime.query(`SELECT rolpassword FROM pg_authid LIMIT 1`),
    );

    const sibling = new Client({
      connectionString: runtimeUrl(ownerUrl(), siblingName),
    });
    await deny(() => sibling.connect());
    await sibling.end().catch(() => undefined);

    const coreName =
      process.env.OPS_ADMIN_PROJECTION_CORE_DATABASE_NAME ?? 'blujet_test';
    const coreProbe = new Client({
      connectionString: runtimeUrl(ownerUrl(), coreName),
    });
    try {
      await coreProbe.connect();
      await deny(() => coreProbe.query(`SELECT 1 FROM identity.users LIMIT 1`));
    } catch (error) {
      expectDenied(error, PASSWORD);
    } finally {
      await coreProbe.end().catch(() => undefined);
    }
  });
});
