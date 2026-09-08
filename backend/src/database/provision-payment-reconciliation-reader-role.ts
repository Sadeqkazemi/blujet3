import 'dotenv/config';
import { Client } from 'pg';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

export const PAYMENT_RECONCILIATION_READER_ROLE =
  'blujet_payment_reconciliation_reader';
export const PAYMENT_RECONCILIATION_READER_RELATIONS = [
  ['payments', 'payment_reconciliations'],
  ['payments', 'payment_attempts'],
  ['payments', 'ledger_entries'],
  ['orders', 'bookings'],
] as const;

const DOMAIN_SCHEMAS = [
  'identity',
  'inventory',
  'orders',
  'payments',
  'loyalty',
  'agency',
  'notify',
  'experience',
  'ops',
  'audit',
  'reporting',
] as const;

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function validatePaymentReconciliationReaderPassword(
  password: string,
): void {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(password)) {
    throw new Error(
      'PAYMENT_RECONCILIATION_DATABASE_PASSWORD must be 32-128 URL-safe characters',
    );
  }
}

export async function provisionPaymentReconciliationReaderRole(
  client: RuntimeRoleSqlClient,
  password: string,
): Promise<{ status: 'PASS'; role: string; relationCount: number }> {
  validatePaymentReconciliationReaderPassword(password);
  await client.query('BEGIN');
  try {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PAYMENT_RECONCILIATION_READER_ROLE}') THEN
        CREATE ROLE ${PAYMENT_RECONCILIATION_READER_ROLE} LOGIN;
      END IF;
    END $$`);
    const formatted = await client.query(
      `SELECT format('ALTER ROLE ${PAYMENT_RECONCILIATION_READER_ROLE} PASSWORD %L', $1::text) AS statement`,
      [password],
    );
    const passwordStatement = formatted.rows[0]?.statement;
    if (typeof passwordStatement !== 'string') {
      throw new Error(
        'PostgreSQL could not prepare the Payment/Reconciliation reader credential',
      );
    }
    await client.query(passwordStatement);
    await client.query(`ALTER ROLE ${PAYMENT_RECONCILIATION_READER_ROLE}
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await client.query(
      `ALTER ROLE ${PAYMENT_RECONCILIATION_READER_ROLE} RESET ALL`,
    );
    await client.query(
      `ALTER ROLE ${PAYMENT_RECONCILIATION_READER_ROLE} SET default_transaction_read_only = on`,
    );
    await client.query(`DO $$ DECLARE parent_role record; BEGIN
      FOR parent_role IN
        SELECT parent.rolname
        FROM pg_auth_members membership
        JOIN pg_roles member ON member.oid = membership.member
        JOIN pg_roles parent ON parent.oid = membership.roleid
        WHERE member.rolname = '${PAYMENT_RECONCILIATION_READER_ROLE}'
      LOOP
        EXECUTE format('REVOKE %I FROM ${PAYMENT_RECONCILIATION_READER_ROLE}', parent_role.rolname);
      END LOOP;
    END $$`);

    const database = await client.query(
      'SELECT current_database() AS database',
    );
    const databaseName = database.rows[0]?.database;
    if (typeof databaseName !== 'string') {
      throw new Error('PostgreSQL database identity is unavailable');
    }
    await client.query(
      `GRANT CONNECT ON DATABASE ${identifier(databaseName)} TO ${PAYMENT_RECONCILIATION_READER_ROLE}`,
    );
    await client.query(
      `REVOKE CREATE ON SCHEMA public FROM ${PAYMENT_RECONCILIATION_READER_ROLE}`,
    );
    for (const schema of DOMAIN_SCHEMAS) {
      const name = identifier(schema);
      await client.query(
        `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${name} FROM ${PAYMENT_RECONCILIATION_READER_ROLE}`,
      );
      await client.query(
        `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${name} FROM ${PAYMENT_RECONCILIATION_READER_ROLE}`,
      );
      await client.query(
        `REVOKE ALL ON SCHEMA ${name} FROM ${PAYMENT_RECONCILIATION_READER_ROLE}`,
      );
    }
    for (const schema of ['payments', 'orders']) {
      await client.query(
        `GRANT USAGE ON SCHEMA ${identifier(schema)} TO ${PAYMENT_RECONCILIATION_READER_ROLE}`,
      );
    }
    for (const [schema, relation] of PAYMENT_RECONCILIATION_READER_RELATIONS) {
      await client.query(
        `GRANT SELECT ON TABLE ${identifier(schema)}.${identifier(relation)} TO ${PAYMENT_RECONCILIATION_READER_ROLE}`,
      );
    }

    const values = PAYMENT_RECONCILIATION_READER_RELATIONS.map(
      ([schema, relation]) => `('${schema}', '${relation}')`,
    ).join(',');
    const checked =
      await client.query(`WITH expected(schema_name, relation_name) AS (VALUES ${values}),
      role_state AS (
        SELECT oid, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls,
          COALESCE((SELECT setting FROM pg_db_role_setting s, unnest(s.setconfig) setting
            WHERE s.setrole = pg_roles.oid AND setting = 'default_transaction_read_only=on' LIMIT 1), '') AS read_only
        FROM pg_roles WHERE rolname = '${PAYMENT_RECONCILIATION_READER_ROLE}'
      ), domain_relations AS (
        SELECT n.nspname AS schema_name, c.relname AS relation_name, c.oid
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY(ARRAY[${DOMAIN_SCHEMAS.map((schema) => `'${schema}'`).join(',')}])
          AND c.relkind IN ('r', 'p')
      )
      SELECT
        EXISTS (SELECT 1 FROM role_state WHERE NOT (rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls) AND read_only != '') AS "restrictedReadOnly",
        NOT EXISTS (SELECT 1 FROM pg_auth_members membership, role_state r WHERE membership.member = r.oid) AS "noMemberships",
        NOT EXISTS (SELECT 1 FROM pg_class c, role_state r WHERE c.relowner = r.oid) AS "noOwnership",
        NOT EXISTS (SELECT 1 FROM domain_relations d LEFT JOIN expected e USING (schema_name, relation_name)
          WHERE has_table_privilege('${PAYMENT_RECONCILIATION_READER_ROLE}', d.oid, 'SELECT') != (e.relation_name IS NOT NULL)) AS "exactReads",
        NOT EXISTS (SELECT 1 FROM domain_relations d WHERE has_table_privilege('${PAYMENT_RECONCILIATION_READER_ROLE}', d.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS "noWrites",
        NOT EXISTS (SELECT 1 FROM pg_sequence s JOIN pg_class c ON c.oid = s.seqrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = ANY(ARRAY[${DOMAIN_SCHEMAS.map((schema) => `'${schema}'`).join(',')}])
            AND has_sequence_privilege('${PAYMENT_RECONCILIATION_READER_ROLE}', s.seqrelid, 'USAGE,SELECT,UPDATE')) AS "noSequences",
        NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE has_schema_privilege('${PAYMENT_RECONCILIATION_READER_ROLE}', n.oid, 'CREATE')) AS "noDdl"`);
    const row = checked.rows[0];
    if (
      !row ||
      [
        'restrictedReadOnly',
        'noOwnership',
        'noMemberships',
        'exactReads',
        'noWrites',
        'noSequences',
        'noDdl',
      ].some((key) => row[key] !== true)
    ) {
      throw new Error(
        'Payment/Reconciliation reader database role verification failed',
      );
    }
    await client.query('COMMIT');
    return {
      status: 'PASS',
      role: PAYMENT_RECONCILIATION_READER_ROLE,
      relationCount: PAYMENT_RECONCILIATION_READER_RELATIONS.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  const password = process.env.PAYMENT_RECONCILIATION_DATABASE_PASSWORD;
  if (!ownerUrl || !password) {
    throw new Error(
      'MIGRATION_DATABASE_URL and PAYMENT_RECONCILIATION_DATABASE_PASSWORD are required',
    );
  }
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const report = await provisionPaymentReconciliationReaderRole(
      client,
      password,
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write(
      'Payment/Reconciliation reader database role provisioning failed\n',
    );
    process.exitCode = 1;
  });
}
