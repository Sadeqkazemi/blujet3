import 'dotenv/config';
import { Client } from 'pg';

export const CORE_RUNTIME_ROLE = 'blujet_core_runtime';

export const CORE_RUNTIME_SCHEMAS = [
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

type QueryResult = { rows: Array<Record<string, unknown>> };

export interface RuntimeRoleSqlClient {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
}

export interface CoreRuntimeRoleReport {
  status: 'PASS';
  role: typeof CORE_RUNTIME_ROLE;
  schemaCount: number;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function validateCoreRuntimePassword(password: string): void {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(password)) {
    throw new Error(
      'CORE_DATABASE_PASSWORD must be 32-128 URL-safe characters',
    );
  }
}

export async function provisionCoreRuntimeRole(
  client: RuntimeRoleSqlClient,
  password: string,
): Promise<CoreRuntimeRoleReport> {
  validateCoreRuntimePassword(password);
  await client.query('BEGIN');
  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = '${CORE_RUNTIME_ROLE}'
        ) THEN
          CREATE ROLE ${CORE_RUNTIME_ROLE} LOGIN;
        END IF;
      END
      $$
    `);
    const formatted = await client.query(
      `SELECT format('ALTER ROLE ${CORE_RUNTIME_ROLE} PASSWORD %L', $1::text) AS statement`,
      [password],
    );
    const passwordStatement = formatted.rows[0]?.statement;
    if (typeof passwordStatement !== 'string') {
      throw new Error('PostgreSQL could not prepare the runtime credential');
    }
    await client.query(passwordStatement);
    await client.query(`
      ALTER ROLE ${CORE_RUNTIME_ROLE}
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
        NOREPLICATION NOBYPASSRLS
    `);

    const database = await client.query(
      'SELECT current_database() AS database',
    );
    const databaseName = database.rows[0]?.database;
    if (typeof databaseName !== 'string') {
      throw new Error('PostgreSQL database identity is unavailable');
    }
    await client.query(
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${CORE_RUNTIME_ROLE}`,
    );
    await client.query(`GRANT USAGE ON SCHEMA public TO ${CORE_RUNTIME_ROLE}`);

    for (const schema of CORE_RUNTIME_SCHEMAS) {
      const identifier = quoteIdentifier(schema);
      await client.query(
        `GRANT USAGE ON SCHEMA ${identifier} TO ${CORE_RUNTIME_ROLE}`,
      );
      await client.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${identifier} TO ${CORE_RUNTIME_ROLE}`,
      );
      await client.query(
        `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${identifier} TO ${CORE_RUNTIME_ROLE}`,
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${identifier} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${CORE_RUNTIME_ROLE}`,
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${identifier} GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${CORE_RUNTIME_ROLE}`,
      );
    }

    const verification = await client.query(`
      WITH role_state AS (
        SELECT oid, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
          rolreplication, rolbypassrls
        FROM pg_roles WHERE rolname = '${CORE_RUNTIME_ROLE}'
      ), owned AS (
        SELECT 1 FROM pg_class c, role_state r WHERE c.relowner = r.oid
        UNION ALL
        SELECT 1 FROM pg_namespace n, role_state r WHERE n.nspowner = r.oid
        UNION ALL
        SELECT 1 FROM pg_database d, role_state r WHERE d.datdba = r.oid
      ), runtime_relations AS (
        SELECT c.oid, c.relkind
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY(ARRAY[${CORE_RUNTIME_SCHEMAS.map((schema) => `'${schema}'`).join(',')}])
          AND c.relkind IN ('r', 'p', 'S')
      )
      SELECT
        EXISTS (
          SELECT 1 FROM role_state
          WHERE NOT (rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb
            OR rolreplication OR rolbypassrls)
        ) AS "restrictedRole",
        NOT EXISTS (SELECT 1 FROM owned) AS "noOwnership",
        NOT EXISTS (
          SELECT 1 FROM runtime_relations
          WHERE (relkind IN ('r', 'p') AND NOT has_table_privilege(
            '${CORE_RUNTIME_ROLE}', oid, 'SELECT,INSERT,UPDATE,DELETE'
          )) OR (relkind = 'S' AND NOT has_sequence_privilege(
            '${CORE_RUNTIME_ROLE}', oid, 'USAGE,SELECT,UPDATE'
          ))
        ) AS "runtimeGrants",
        NOT has_database_privilege(
          '${CORE_RUNTIME_ROLE}', current_database(), 'CREATE'
        ) AND NOT EXISTS (
          SELECT 1 FROM pg_namespace
          WHERE has_schema_privilege('${CORE_RUNTIME_ROLE}', oid, 'CREATE')
        ) AS "noDdl"
    `);
    const checks = verification.rows[0];
    if (
      !checks ||
      ['restrictedRole', 'noOwnership', 'runtimeGrants', 'noDdl'].some(
        (key) => checks[key] !== true,
      )
    ) {
      throw new Error('Core runtime database role verification failed');
    }
    await client.query('COMMIT');
    return {
      status: 'PASS',
      role: CORE_RUNTIME_ROLE,
      schemaCount: CORE_RUNTIME_SCHEMAS.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  const password = process.env.CORE_DATABASE_PASSWORD;
  if (!ownerUrl || !password) {
    throw new Error(
      'MIGRATION_DATABASE_URL and CORE_DATABASE_PASSWORD are required',
    );
  }
  const parsed = new URL(ownerUrl);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('MIGRATION_DATABASE_URL must be PostgreSQL');
  }
  if (decodeURIComponent(parsed.username) === CORE_RUNTIME_ROLE) {
    throw new Error('Migration owner must differ from the runtime role');
  }

  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const report = await provisionCoreRuntimeRole(client, password);
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write('Core runtime database role provisioning failed\n');
    process.exitCode = 1;
  });
}
