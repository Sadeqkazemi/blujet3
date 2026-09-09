import 'dotenv/config';
import { Client } from 'pg';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

export const INVENTORY_READER_ROLE = 'blujet_inventory_reader';
export const INVENTORY_READER_COLUMNS = [
  ['inventory', 'flight_instances', 'id'],
  ['inventory', 'flight_instances', 'departureAt'],
  ['inventory', 'flight_instances', 'arrivalAt'],
  ['inventory', 'flight_instances', 'capacity'],
  ['inventory', 'flight_instances', 'charterSeats'],
  ['inventory', 'flight_instances', 'agencySeatsAllocated'],
  ['inventory', 'flight_instances', 'status'],
  ['inventory', 'flight_instances', 'version'],
  ['inventory', 'seat_locks', 'flightInstanceId'],
  ['inventory', 'seat_locks', 'releasedAt'],
  ['inventory', 'seat_locks', 'expiresAt'],
  ['inventory', 'seat_locks', 'bookingId'],
  ['orders', 'core_itinerary_orders', 'id'],
  ['orders', 'core_itinerary_orders', 'status'],
  ['orders', 'core_itinerary_orders', 'holdExpiresAt'],
  ['orders', 'core_itinerary_segments', 'orderId'],
  ['orders', 'core_itinerary_segments', 'flightInstanceId'],
  ['orders', 'core_itinerary_segments', 'occupiedSeats'],
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

export function validateInventoryReaderPassword(password: string): void {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(password)) {
    throw new Error(
      'INVENTORY_DATABASE_PASSWORD must be 32-128 URL-safe characters',
    );
  }
}

export async function provisionInventoryReaderRole(
  client: RuntimeRoleSqlClient,
  password: string,
): Promise<{ status: 'PASS'; role: string; columnCount: number }> {
  validateInventoryReaderPassword(password);
  await client.query('BEGIN');
  try {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${INVENTORY_READER_ROLE}') THEN
        CREATE ROLE ${INVENTORY_READER_ROLE} LOGIN;
      END IF;
    END $$`);
    const formatted = await client.query(
      `SELECT format('ALTER ROLE ${INVENTORY_READER_ROLE} PASSWORD %L', $1::text) AS statement`,
      [password],
    );
    const passwordStatement = formatted.rows[0]?.statement;
    if (typeof passwordStatement !== 'string') {
      throw new Error(
        'PostgreSQL could not prepare the Inventory reader credential',
      );
    }
    await client.query(passwordStatement);
    await client.query(`ALTER ROLE ${INVENTORY_READER_ROLE}
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await client.query(`ALTER ROLE ${INVENTORY_READER_ROLE} RESET ALL`);
    await client.query(
      `ALTER ROLE ${INVENTORY_READER_ROLE} SET default_transaction_read_only = on`,
    );
    await client.query(`DO $$ DECLARE parent_role record; BEGIN
      FOR parent_role IN
        SELECT parent.rolname
        FROM pg_auth_members membership
        JOIN pg_roles member ON member.oid = membership.member
        JOIN pg_roles parent ON parent.oid = membership.roleid
        WHERE member.rolname = '${INVENTORY_READER_ROLE}'
      LOOP
        EXECUTE format('REVOKE %I FROM ${INVENTORY_READER_ROLE}', parent_role.rolname);
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
      `GRANT CONNECT ON DATABASE ${identifier(databaseName)} TO ${INVENTORY_READER_ROLE}`,
    );
    await client.query(
      `REVOKE CREATE ON SCHEMA public FROM ${INVENTORY_READER_ROLE}`,
    );
    for (const schema of DOMAIN_SCHEMAS) {
      const name = identifier(schema);
      await client.query(
        `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${name} FROM ${INVENTORY_READER_ROLE}`,
      );
      await client.query(
        `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${name} FROM ${INVENTORY_READER_ROLE}`,
      );
      await client.query(
        `REVOKE ALL ON SCHEMA ${name} FROM ${INVENTORY_READER_ROLE}`,
      );
    }
    for (const schema of ['inventory', 'orders']) {
      await client.query(
        `GRANT USAGE ON SCHEMA ${identifier(schema)} TO ${INVENTORY_READER_ROLE}`,
      );
    }
    for (const [schema, relation, column] of INVENTORY_READER_COLUMNS) {
      await client.query(
        `GRANT SELECT (${identifier(column)}) ON TABLE ${identifier(schema)}.${identifier(relation)} TO ${INVENTORY_READER_ROLE}`,
      );
    }

    const expected = INVENTORY_READER_COLUMNS.map(
      ([schema, relation, column]) =>
        `('${schema}', '${relation}', '${column}')`,
    ).join(',');
    const checked =
      await client.query(`WITH expected(schema_name, relation_name, column_name) AS (VALUES ${expected}),
      role_state AS (
        SELECT oid, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls,
          COALESCE((SELECT setting FROM pg_db_role_setting s, unnest(s.setconfig) setting
            WHERE s.setrole = pg_roles.oid AND setting = 'default_transaction_read_only=on' LIMIT 1), '') AS read_only
        FROM pg_roles WHERE rolname = '${INVENTORY_READER_ROLE}'
      ), domain_columns AS (
        SELECT n.nspname AS schema_name, c.relname AS relation_name, a.attname AS column_name, c.oid
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = ANY(ARRAY[${DOMAIN_SCHEMAS.map((schema) => `'${schema}'`).join(',')}])
          AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
      )
      SELECT
        EXISTS (SELECT 1 FROM role_state WHERE NOT (rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls) AND read_only != '') AS "restrictedReadOnly",
        NOT EXISTS (SELECT 1 FROM pg_auth_members membership, role_state r WHERE membership.member = r.oid) AS "noMemberships",
        NOT EXISTS (SELECT 1 FROM pg_class c, role_state r WHERE c.relowner = r.oid) AS "noOwnership",
        NOT EXISTS (SELECT 1 FROM domain_columns d LEFT JOIN expected e USING (schema_name, relation_name, column_name)
          WHERE has_column_privilege('${INVENTORY_READER_ROLE}', d.oid, d.column_name, 'SELECT') != (e.column_name IS NOT NULL)) AS "exactColumns",
        NOT EXISTS (SELECT 1 FROM domain_columns d WHERE
          has_column_privilege('${INVENTORY_READER_ROLE}', d.oid, d.column_name, 'INSERT')
          OR has_column_privilege('${INVENTORY_READER_ROLE}', d.oid, d.column_name, 'UPDATE')
          OR has_column_privilege('${INVENTORY_READER_ROLE}', d.oid, d.column_name, 'REFERENCES'))
          AND NOT EXISTS (SELECT 1 FROM domain_columns d2 WHERE has_table_privilege('${INVENTORY_READER_ROLE}', d2.oid, 'DELETE,TRUNCATE,TRIGGER')) AS "noWrites",
        NOT EXISTS (SELECT 1 FROM pg_sequence s JOIN pg_class c ON c.oid = s.seqrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = ANY(ARRAY[${DOMAIN_SCHEMAS.map((schema) => `'${schema}'`).join(',')}])
            AND has_sequence_privilege('${INVENTORY_READER_ROLE}', s.seqrelid, 'USAGE,SELECT,UPDATE')) AS "noSequences",
        NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE has_schema_privilege('${INVENTORY_READER_ROLE}', n.oid, 'CREATE')) AS "noDdl"`);
    const row = checked.rows[0];
    if (
      !row ||
      [
        'restrictedReadOnly',
        'noOwnership',
        'noMemberships',
        'exactColumns',
        'noWrites',
        'noSequences',
        'noDdl',
      ].some((key) => row[key] !== true)
    ) {
      throw new Error('Inventory reader database role verification failed');
    }
    await client.query('COMMIT');
    return {
      status: 'PASS',
      role: INVENTORY_READER_ROLE,
      columnCount: INVENTORY_READER_COLUMNS.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  const password = process.env.INVENTORY_DATABASE_PASSWORD;
  if (!ownerUrl || !password) {
    throw new Error(
      'MIGRATION_DATABASE_URL and INVENTORY_DATABASE_PASSWORD are required',
    );
  }
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const report = await provisionInventoryReaderRole(client, password);
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write(
      'Inventory reader database role provisioning failed\n',
    );
    process.exitCode = 1;
  });
}
