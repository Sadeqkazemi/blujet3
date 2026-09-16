import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  LOYALTY_PROJECTION_RUNTIME_ROLE,
  LOYALTY_RUNTIME_GRANTS,
  provisionLoyaltyProjectionRuntimeRole,
} from '../src/database/provision-loyalty-projection-runtime-role';

const PASSWORD = 'loyalty_projection_runtime_ci_2026';
const enabled = process.env.LOYALTY_RUNTIME_ROLE_E2E_ENABLED === 'true';
const describeDatabase = enabled ? describe : describe.skip;
const DATABASE_PRIVILEGES = new Set(['CONNECT', 'CREATE', 'TEMPORARY']);

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function runtimeUrl(ownerUrl: string): string {
  const url = new URL(ownerUrl);
  url.username = LOYALTY_PROJECTION_RUNTIME_ROLE;
  url.password = PASSWORD;
  return url.toString();
}

describeDatabase('Loyalty projection runtime role (PostgreSQL)', () => {
  const ownerUrl = process.env.LOYALTY_DATABASE_URL ?? '';
  const memberId = `loyalty-role-${process.pid}`;
  const eventId = randomUUID();
  const failureEventId = randomUUID();
  const foreignDatabase = `blujet_core_guard_${process.pid}`;
  let owner: Client;
  let runtime: Client;
  let publicDatabasePrivileges = new Map<string, string[]>();

  beforeAll(async () => {
    const parsed = new URL(ownerUrl);
    if (!parsed.pathname.endsWith('_test')) {
      throw new Error('Loyalty runtime role E2E requires a test database');
    }
    owner = new Client({ connectionString: ownerUrl });
    await owner.connect();
    const publicGrants = await owner.query<{
      databaseName: string;
      privilege: string;
    }>(
      `SELECT d.datname AS "databaseName", acl.privilege_type AS privilege
       FROM pg_database d
       JOIN LATERAL aclexplode(
         COALESCE(d.datacl, acldefault('d', d.datdba))
       ) acl ON true
       WHERE d.datallowconn AND NOT d.datistemplate
         AND acl.grantee = 0
         AND acl.privilege_type IN ('CONNECT', 'CREATE', 'TEMPORARY')`,
    );
    publicDatabasePrivileges = publicGrants.rows.reduce((grants, row) => {
      if (!DATABASE_PRIVILEGES.has(row.privilege)) {
        throw new Error('Unexpected PostgreSQL database privilege');
      }
      const privileges = grants.get(row.databaseName) ?? [];
      privileges.push(row.privilege);
      grants.set(row.databaseName, privileges);
      return grants;
    }, new Map<string, string[]>());
    await owner.query(`DROP DATABASE IF EXISTS ${identifier(foreignDatabase)}`);
    await owner.query(`CREATE DATABASE ${identifier(foreignDatabase)}`);
    await owner.query('CREATE SCHEMA IF NOT EXISTS outside_domain');
    await owner.query(
      'CREATE TABLE IF NOT EXISTS outside_domain.private_rows (id integer PRIMARY KEY)',
    );
    await owner.query(
      'CREATE SEQUENCE IF NOT EXISTS loyalty.runtime_guard_sequence',
    );
    await provisionLoyaltyProjectionRuntimeRole(
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
      `DELETE FROM loyalty.kafka_processing_failures WHERE "eventId" = $1`,
      [failureEventId],
    );
    await owner.query(
      `DELETE FROM loyalty.kafka_consumer_checkpoints
       WHERE "consumerGroup" = 'loyalty-role-e2e'`,
    );
    await owner.query(
      `DELETE FROM loyalty.loyalty_projection_slots
       WHERE "aggregateType" = 'LoyaltyMember' AND "aggregateId" = $1`,
      [memberId],
    );
    await owner.query(
      `ALTER TABLE loyalty.loyalty_projection_event_receipts
       DISABLE TRIGGER loyalty_projection_event_receipts_immutable_guard`,
    );
    try {
      await owner.query(
        `DELETE FROM loyalty.loyalty_projection_event_receipts
         WHERE "eventId" = $1`,
        [eventId],
      );
    } finally {
      await owner.query(
        `ALTER TABLE loyalty.loyalty_projection_event_receipts
         ENABLE TRIGGER loyalty_projection_event_receipts_immutable_guard`,
      );
    }
    await owner.query('DELETE FROM loyalty.club_members WHERE id = $1', [
      memberId,
    ]);
    await owner.query('DROP SEQUENCE IF EXISTS loyalty.runtime_guard_sequence');
    await owner.query('DROP SCHEMA IF EXISTS outside_domain CASCADE');
    await owner.query(`DROP DATABASE IF EXISTS ${identifier(foreignDatabase)}`);
    await owner.query(
      `DROP OWNED BY ${identifier(LOYALTY_PROJECTION_RUNTIME_ROLE)}`,
    );
    await owner.query(
      `ALTER ROLE ${identifier(LOYALTY_PROJECTION_RUNTIME_ROLE)} RESET ALL`,
    );
    await owner.query(
      `DROP ROLE IF EXISTS ${identifier(LOYALTY_PROJECTION_RUNTIME_ROLE)}`,
    );
    const databases = await owner.query<{ databaseName: string }>(
      `SELECT datname AS "databaseName"
       FROM pg_database
       WHERE datallowconn AND NOT datistemplate`,
    );
    for (const database of databases.rows) {
      await owner.query(
        `REVOKE ALL PRIVILEGES ON DATABASE ${identifier(database.databaseName)} FROM PUBLIC`,
      );
      const privileges = publicDatabasePrivileges.get(database.databaseName);
      if (privileges?.length) {
        await owner.query(
          `GRANT ${privileges.join(', ')} ON DATABASE ${identifier(database.databaseName)} TO PUBLIC`,
        );
      }
    }
    await owner.end();
  });

  it('uses bounded UTC sessions and has no role membership or ownership', async () => {
    await expect(runtime.query('SHOW timezone')).resolves.toMatchObject({
      rows: [{ TimeZone: 'UTC' }],
    });
    await expect(
      runtime.query('SHOW statement_timeout'),
    ).resolves.toMatchObject({ rows: [{ statement_timeout: '5s' }] });
    await expect(runtime.query('SHOW lock_timeout')).resolves.toMatchObject({
      rows: [{ lock_timeout: '2s' }],
    });
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
      [LOYALTY_PROJECTION_RUNTIME_ROLE],
    );
    expect(state.rows[0]).toEqual({
      noMemberships: true,
      noOwnership: true,
    });
  });

  it('has every required table privilege and no receipt update', async () => {
    for (const grant of LOYALTY_RUNTIME_GRANTS) {
      for (const privilege of grant.privileges) {
        const result = await runtime.query(
          'SELECT has_table_privilege(current_user, $1, $2) AS allowed',
          [`loyalty.${grant.table}`, privilege],
        );
        expect(result.rows[0]?.allowed).toBe(true);
      }
    }
    const receiptUpdate = await runtime.query(
      `SELECT has_table_privilege(
        current_user, 'loyalty.loyalty_projection_event_receipts', 'UPDATE'
      ) AS allowed`,
    );
    expect(receiptUpdate.rows[0]?.allowed).toBe(false);
  });

  it('allows projection, receipt, slot, checkpoint and failure writes', async () => {
    const fingerprint = 'a'.repeat(64);
    await runtime.query(
      `INSERT INTO loyalty.club_members
        (id, "fullName", email, "nationalIdEnc", "nationalIdHash", version)
       VALUES ($1, 'عضو تست نقش', 'role@example.test', 'encrypted', $2, 1)`,
      [memberId, `hash-${memberId}`],
    );
    await runtime.query(
      `UPDATE loyalty.club_members SET "fullName" = 'عضو تست به‌روز'
       WHERE id = $1`,
      [memberId],
    );
    await runtime.query(
      `INSERT INTO loyalty.loyalty_projection_event_receipts
        ("eventId", "envelopeFingerprint", "semanticFingerprint",
         "aggregateType", "aggregateId", "recordVersion", "auditId")
       VALUES ($1, $2, $2, 'LoyaltyMember', $3, 1, 'audit-role-e2e')`,
      [eventId, fingerprint, memberId],
    );
    await runtime.query(
      `INSERT INTO loyalty.loyalty_projection_slots
        ("aggregateType", "aggregateId", "recordVersion",
         "semanticFingerprint", "auditId")
       VALUES ('LoyaltyMember', $1, 1, $2, 'audit-role-e2e')`,
      [memberId, fingerprint],
    );
    await runtime.query(
      `UPDATE loyalty.loyalty_projection_slots SET "recordVersion" = 2
       WHERE "aggregateType" = 'LoyaltyMember' AND "aggregateId" = $1`,
      [memberId],
    );
    await runtime.query(
      `INSERT INTO loyalty.kafka_consumer_checkpoints
        ("consumerGroup", topic, partition, "nextOffset", "highWatermark")
       VALUES ('loyalty-role-e2e', 'blujet.events.v1', 0, 1, 1)`,
    );
    await runtime.query(
      `UPDATE loyalty.kafka_consumer_checkpoints SET "nextOffset" = 2
       WHERE "consumerGroup" = 'loyalty-role-e2e'`,
    );
    await runtime.query(
      `INSERT INTO loyalty.kafka_processing_failures
        ("consumerGroup", topic, partition, "offset", fingerprint, "eventId",
         stage, attempts, "totalAttempts", status, "firstFailedAt", "lastFailedAt")
       VALUES ('loyalty-role-e2e', 'blujet.events.v1', 0, 2, $1, $2,
         'PROJECTION', 1, 1, 'RETRYING', now(), now())`,
      [fingerprint, failureEventId],
    );
    await runtime.query(
      `UPDATE loyalty.kafka_processing_failures SET status = 'RESOLVED',
        "resolvedAt" = now() WHERE "eventId" = $1`,
      [failureEventId],
    );
  });

  it.each([
    `UPDATE loyalty.loyalty_projection_event_receipts SET "recordVersion" = 2
     WHERE "eventId" = '${eventId}'`,
    `DELETE FROM loyalty.club_members WHERE id = '${memberId}'`,
    'CREATE TABLE loyalty.runtime_forbidden (id integer)',
    "SELECT nextval('loyalty.runtime_guard_sequence')",
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
      provisionLoyaltyProjectionRuntimeRole(
        owner,
        PASSWORD,
        parsed.pathname.slice(1),
      ),
    ).resolves.toMatchObject({ status: 'PASS', relationCount: 10 });
  });
});
