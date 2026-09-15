import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  provisionReportingProjectionRuntimeRole,
  REPORTING_PROJECTION_RUNTIME_ROLE,
} from '../src/database/provision-reporting-projection-runtime-role';

const PASSWORD = 'reporting_runtime_ci_password_2026';
const enabled = process.env.REPORTING_ROLE_E2E_ENABLED === 'true';
const describeDatabase = enabled ? describe : describe.skip;

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function runtimeUrl(ownerUrl: string): string {
  const url = new URL(ownerUrl);
  url.username = REPORTING_PROJECTION_RUNTIME_ROLE;
  url.password = PASSWORD;
  return url.toString();
}

describeDatabase('Reporting projection runtime role (PostgreSQL)', () => {
  const ownerUrl = process.env.REPORTING_DATABASE_URL ?? '';
  const eventId = randomUUID();
  const failureEventId = randomUUID();
  const foreignDatabase = `blujet_core_guard_${process.pid}`;
  let owner: Client;
  let runtime: Client;

  beforeAll(async () => {
    const parsed = new URL(ownerUrl);
    if (!parsed.pathname.endsWith('_test')) {
      throw new Error('Reporting runtime role E2E requires a test database');
    }
    owner = new Client({ connectionString: ownerUrl });
    await owner.connect();
    await owner.query(`DROP DATABASE IF EXISTS ${identifier(foreignDatabase)}`);
    await owner.query(`CREATE DATABASE ${identifier(foreignDatabase)}`);
    await owner.query('CREATE SCHEMA IF NOT EXISTS outside_domain');
    await owner.query(
      'CREATE TABLE IF NOT EXISTS outside_domain.private_rows (id integer PRIMARY KEY)',
    );
    await owner.query(
      'CREATE SEQUENCE IF NOT EXISTS reporting.runtime_guard_sequence',
    );
    await provisionReportingProjectionRuntimeRole(
      owner,
      PASSWORD,
      parsed.pathname.slice(1),
    );
    runtime = new Client({ connectionString: runtimeUrl(ownerUrl) });
    await runtime.connect();
  });

  afterAll(async () => {
    if (runtime) await runtime.end();
    if (!owner) return;
    await owner.query(
      `DELETE FROM reporting.kafka_processing_failures WHERE "eventId" = $1`,
      [failureEventId],
    );
    await owner.query(
      `DELETE FROM reporting.kafka_consumer_checkpoints
       WHERE "consumerGroup" = 'reporting-role-e2e'`,
    );
    await owner.query(
      `DELETE FROM reporting.core_itinerary_event_projections
       WHERE "eventId" = $1`,
      [eventId],
    );
    await owner.query(
      `DELETE FROM reporting.core_itinerary_event_receipts
       WHERE "eventId" = $1`,
      [eventId],
    );
    await owner.query(
      'DROP SEQUENCE IF EXISTS reporting.runtime_guard_sequence',
    );
    await owner.query('DROP SCHEMA IF EXISTS outside_domain CASCADE');
    await owner.query(`DROP DATABASE IF EXISTS ${identifier(foreignDatabase)}`);
    await owner.query(
      `DROP OWNED BY ${identifier(REPORTING_PROJECTION_RUNTIME_ROLE)}`,
    );
    await owner.query(
      `ALTER ROLE ${identifier(REPORTING_PROJECTION_RUNTIME_ROLE)} RESET ALL`,
    );
    await owner.query(
      `DROP ROLE IF EXISTS ${identifier(REPORTING_PROJECTION_RUNTIME_ROLE)}`,
    );
    await owner.end();
  });

  it('uses bounded UTC sessions and has no role membership or ownership', async () => {
    await expect(runtime.query('SHOW timezone')).resolves.toMatchObject({
      rows: [{ TimeZone: 'UTC' }],
    });
    await expect(
      runtime.query('SHOW statement_timeout'),
    ).resolves.toMatchObject({ rows: [{ statement_timeout: '5s' }] });
    const state = await owner.query(
      `SELECT
        NOT EXISTS (
          SELECT 1 FROM pg_auth_members membership
          JOIN pg_roles role ON role.oid = membership.member
          WHERE role.rolname = $1
        ) AS "noMemberships",
        NOT EXISTS (
          SELECT 1 FROM pg_class relation JOIN pg_roles role
            ON role.oid = relation.relowner WHERE role.rolname = $1
          UNION ALL
          SELECT 1 FROM pg_namespace namespace JOIN pg_roles role
            ON role.oid = namespace.nspowner WHERE role.rolname = $1
        ) AS "noOwnership"`,
      [REPORTING_PROJECTION_RUNTIME_ROLE],
    );
    expect(state.rows[0]).toEqual({
      noMemberships: true,
      noOwnership: true,
    });
  });

  it('allows the exact projection, receipt, checkpoint and failure writes', async () => {
    const fingerprint = 'a'.repeat(64);
    await runtime.query(
      `INSERT INTO reporting.core_itinerary_event_receipts
        ("eventId", fingerprint, "orderId", "eventType", "orderVersion")
       VALUES ($1, $2, 'order-role-e2e', 'OrderCreated', 1)`,
      [eventId, fingerprint],
    );
    await runtime.query(
      `INSERT INTO reporting.core_itinerary_event_projections
        ("orderId", "eventType", "eventId", fingerprint, "orderVersion",
         currency, payload, "occurredAt")
       VALUES ('order-role-e2e', 'OrderCreated', $1, $2, 1, 'IRR',
         '{"status":"HELD"}'::jsonb, '2026-09-15T00:00:00.000Z')`,
      [eventId, fingerprint],
    );
    await runtime.query(
      `UPDATE reporting.core_itinerary_event_projections
       SET "orderVersion" = 2 WHERE "eventId" = $1`,
      [eventId],
    );
    await runtime.query(
      `INSERT INTO reporting.kafka_consumer_checkpoints
        ("consumerGroup", topic, partition, "nextOffset", "highWatermark")
       VALUES ('reporting-role-e2e', 'blujet.events.v1', 0, 1, 1)`,
    );
    await runtime.query(
      `UPDATE reporting.kafka_consumer_checkpoints SET "nextOffset" = 2
       WHERE "consumerGroup" = 'reporting-role-e2e'`,
    );
    await runtime.query(
      `INSERT INTO reporting.kafka_processing_failures
        ("consumerGroup", topic, partition, "offset", fingerprint, "eventId",
         stage, attempts, "totalAttempts", status, "firstFailedAt", "lastFailedAt")
       VALUES ('reporting-role-e2e', 'blujet.events.v1', 0, 2, $1, $2,
         'PROJECTION', 1, 1, 'RETRYING', now(), now())`,
      [fingerprint, failureEventId],
    );
    await runtime.query(
      `UPDATE reporting.kafka_processing_failures SET status = 'RESOLVED',
        "resolvedAt" = now() WHERE "eventId" = $1`,
      [failureEventId],
    );
    await expect(
      runtime.query(
        `SELECT count(*)::int AS count
         FROM reporting.core_itinerary_event_projections
         WHERE "eventId" = $1`,
        [eventId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });

  it.each([
    `UPDATE reporting.core_itinerary_event_receipts SET "orderVersion" = 2
     WHERE "eventId" = '${eventId}'`,
    `DELETE FROM reporting.core_itinerary_event_projections
     WHERE "eventId" = '${eventId}'`,
    'CREATE TABLE reporting.runtime_forbidden (id integer)',
    "SELECT nextval('reporting.runtime_guard_sequence')",
    'SELECT * FROM outside_domain.private_rows',
  ])('denies forbidden SQL: %s', async (sql) => {
    await expect(runtime.query(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('cannot connect to a foreign/Core database', async () => {
    const url = new URL(runtimeUrl(ownerUrl));
    url.pathname = `/${foreignDatabase}`;
    const foreign = new Client({ connectionString: url.toString() });
    await expect(foreign.connect()).rejects.toMatchObject({ code: '42501' });
    await foreign.end().catch(() => undefined);
  });

  it('remains exact and idempotent on a second provisioning run', async () => {
    const parsed = new URL(ownerUrl);
    await expect(
      provisionReportingProjectionRuntimeRole(
        owner,
        PASSWORD,
        parsed.pathname.slice(1),
      ),
    ).resolves.toMatchObject({ status: 'PASS', relationCount: 4 });
  });
});
