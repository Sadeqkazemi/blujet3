import 'dotenv/config';
import { Client } from 'pg';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';
import { OPS_ADMIN_CARTABLE_COLUMNS } from './provision-ops-admin-reader-role';
import {
  OPS_ADMIN_PROJECTION_MIN_SERVER_VERSION,
  OPS_ADMIN_PROJECTION_RUNTIME_ROLE,
  parseOpsAdminProjectionOwnerUrl,
  validateOpsAdminProjectionDatabaseName,
} from './provision-ops-admin-projection-runtime-role';

export const OPS_ADMIN_PROJECTION_READER_ROLE =
  'blujet_ops_admin_projection_reader';
export const OPS_ADMIN_PROJECTION_READER_SCHEMA = 'ops';
export const OPS_ADMIN_PROJECTION_READER_COLUMNS = OPS_ADMIN_CARTABLE_COLUMNS;
export const OPS_ADMIN_PROJECTION_READER_DENIED_COLUMNS = [
  'taskVersion',
  'auditId',
  'fingerprint',
] as const;
export const OPS_ADMIN_PROJECTION_READER_CONTROL_TABLES = [
  'cartable_projection_event_receipts',
  'kafka_consumer_checkpoints',
] as const;

const FOREIGN_SCHEMAS = [
  'public',
  'identity',
  'inventory',
  'orders',
  'payments',
  'loyalty',
  'agency',
  'notify',
  'experience',
  'audit',
  'reporting',
] as const;

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function validateOpsAdminProjectionReaderPassword(
  password: string,
): void {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(password)) {
    throw new Error(
      'OPS_ADMIN_PROJECTION_READER_PASSWORD must be 32-128 URL-safe characters',
    );
  }
}

export function assertOpsAdminProjectionReaderRole(role: string): void {
  if (role === OPS_ADMIN_PROJECTION_RUNTIME_ROLE) {
    throw new Error(
      'Ops/Admin projection HTTP reader must not reuse the projection writer',
    );
  }
  if (role !== OPS_ADMIN_PROJECTION_READER_ROLE) {
    throw new Error('Ops/Admin projection HTTP reader role is invalid');
  }
}

export async function provisionOpsAdminProjectionReaderRole(
  client: RuntimeRoleSqlClient,
  password: string,
  expectedDatabaseName?: string,
): Promise<{ status: 'PASS'; role: string; relationCount: number }> {
  validateOpsAdminProjectionReaderPassword(password);
  assertOpsAdminProjectionReaderRole(OPS_ADMIN_PROJECTION_READER_ROLE);
  const role = identifier(OPS_ADMIN_PROJECTION_READER_ROLE);
  const schema = identifier(OPS_ADMIN_PROJECTION_READER_SCHEMA);
  const expectedColumns = OPS_ADMIN_PROJECTION_READER_COLUMNS.map(
    (column) => `('${column}')`,
  ).join(',');
  const deniedColumns =
    OPS_ADMIN_PROJECTION_READER_DENIED_COLUMNS.map(literal).join(', ');
  const controlTables =
    OPS_ADMIN_PROJECTION_READER_CONTROL_TABLES.map(literal).join(', ');

  await client.query('BEGIN');
  try {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${OPS_ADMIN_PROJECTION_READER_ROLE}') THEN
        CREATE ROLE ${role} LOGIN;
      END IF;
    END $$`);
    const formatted = await client.query(
      `SELECT format('ALTER ROLE ${role} PASSWORD %L', $1::text) AS statement`,
      [password],
    );
    const passwordStatement = formatted.rows[0]?.statement;
    if (typeof passwordStatement !== 'string') {
      throw new Error(
        'PostgreSQL could not prepare the Ops/Admin projection reader credential',
      );
    }
    await client.query(passwordStatement);
    await client.query(`ALTER ROLE ${role}
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await client.query(`ALTER ROLE ${role} RESET ALL`);
    await client.query(
      `ALTER ROLE ${role} SET default_transaction_read_only = on`,
    );
    await client.query(`DO $$ DECLARE parent_role record; BEGIN
      FOR parent_role IN
        SELECT parent.rolname
        FROM pg_auth_members membership
        JOIN pg_roles member ON member.oid = membership.member
        JOIN pg_roles parent ON parent.oid = membership.roleid
        WHERE member.rolname = '${OPS_ADMIN_PROJECTION_READER_ROLE}'
      LOOP
        EXECUTE format('REVOKE %I FROM ${role}', parent_role.rolname);
      END LOOP;
    END $$`);

    const identity = await client.query(
      `SELECT current_database() AS database,
        current_setting('server_version_num')::int AS version`,
    );
    const databaseName = identity.rows[0]?.database;
    const version = identity.rows[0]?.version;
    if (typeof databaseName !== 'string' || typeof version !== 'number') {
      throw new Error('PostgreSQL database identity is unavailable');
    }
    if (version < OPS_ADMIN_PROJECTION_MIN_SERVER_VERSION) {
      throw new Error('Ops/Admin projection reader requires PostgreSQL 16');
    }
    validateOpsAdminProjectionDatabaseName(databaseName);
    if (
      expectedDatabaseName !== undefined &&
      expectedDatabaseName !== databaseName
    ) {
      throw new Error(
        'Ops/Admin projection owner URL must target an isolated Ops/Admin database',
      );
    }
    const databaseIdentifier = identifier(databaseName);

    await client.query(
      `REVOKE ALL ON DATABASE ${databaseIdentifier} FROM PUBLIC`,
    );
    await client.query(
      `REVOKE ALL ON DATABASE ${databaseIdentifier} FROM ${role}`,
    );
    await client.query(
      `GRANT CONNECT ON DATABASE ${databaseIdentifier} TO CURRENT_USER`,
    );
    await client.query(
      `GRANT CONNECT ON DATABASE ${databaseIdentifier} TO ${role}`,
    );

    await client.query(`DO $$ DECLARE
      target record;
      preserved text[];
      grantee text;
    BEGIN
      FOR target IN
        SELECT d.datname, pg_get_userbyid(d.datdba) AS owner_name, d.oid
        FROM pg_database d
        WHERE d.datallowconn AND NOT d.datistemplate
          AND d.datname <> current_database()
      LOOP
        SELECT coalesce(array_agg(DISTINCT r.rolname), ARRAY[]::text[])
        INTO preserved
        FROM pg_database d
        JOIN LATERAL aclexplode(
          COALESCE(d.datacl, acldefault('d', d.datdba))
        ) acl ON true
        JOIN pg_roles r ON r.oid = acl.grantee AND acl.grantee <> 0
        WHERE d.oid = target.oid
          AND acl.privilege_type = 'CONNECT'
          AND r.rolname <> '${OPS_ADMIN_PROJECTION_READER_ROLE}';
        EXECUTE format(
          'REVOKE CONNECT ON DATABASE %I FROM PUBLIC', target.datname
        );
        EXECUTE format(
          'REVOKE CONNECT ON DATABASE %I FROM ${role}', target.datname
        );
        EXECUTE format(
          'GRANT CONNECT ON DATABASE %I TO %I',
          target.datname, target.owner_name
        );
        EXECUTE format(
          'GRANT CONNECT ON DATABASE %I TO CURRENT_USER', target.datname
        );
        FOREACH grantee IN ARRAY preserved LOOP
          EXECUTE format(
            'GRANT CONNECT ON DATABASE %I TO %I', target.datname, grantee
          );
        END LOOP;
      END LOOP;
    END $$`);

    await client.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await client.query(`REVOKE ALL ON SCHEMA public FROM ${role}`);
    await client.query(`DO $$ DECLARE foreign_schema record; BEGIN
      FOR foreign_schema IN
        SELECT nspname
        FROM pg_namespace
        WHERE nspname = ANY(ARRAY[${FOREIGN_SCHEMAS.map(literal).join(', ')}])
      LOOP
        EXECUTE format('REVOKE ALL ON SCHEMA %I FROM ${role}', foreign_schema.nspname);
      END LOOP;
    END $$`);
    await client.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await client.query(
      `REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM ${role}`,
    );
    await client.query(
      `REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${schema} FROM ${role}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE ALL ON TABLES FROM ${role}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE ALL ON SEQUENCES FROM ${role}`,
    );
    await client.query(
      `GRANT SELECT (${OPS_ADMIN_PROJECTION_READER_COLUMNS.map(identifier).join(', ')}) ON TABLE ${schema}."cartable_tasks" TO ${role}`,
    );
    await client.query(
      `ALTER ROLE ${role} IN DATABASE ${databaseIdentifier} SET search_path = ${schema}, pg_catalog`,
    );

    const verification =
      await client.query(`WITH expected_columns(column_name) AS (
      VALUES ${expectedColumns}
    ), role_state AS (
      SELECT oid, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
        rolreplication, rolbypassrls,
        COALESCE((SELECT setting FROM pg_db_role_setting s, unnest(s.setconfig) setting
          WHERE s.setrole = pg_roles.oid
            AND setting = 'default_transaction_read_only=on' LIMIT 1), '') AS read_only
      FROM pg_roles WHERE rolname = '${OPS_ADMIN_PROJECTION_READER_ROLE}'
    ), owned AS (
      SELECT 1 FROM pg_class c, role_state r WHERE c.relowner = r.oid
      UNION ALL
      SELECT 1 FROM pg_namespace n, role_state r WHERE n.nspowner = r.oid
      UNION ALL
      SELECT 1 FROM pg_database d, role_state r WHERE d.datdba = r.oid
    ), ops_relations AS (
      SELECT c.oid, c.relkind, c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${OPS_ADMIN_PROJECTION_READER_SCHEMA}'
        AND c.relkind IN ('r', 'p', 'S')
    ), cartable_columns AS (
      SELECT c.oid, a.attname AS column_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'ops' AND c.relname = 'cartable_tasks'
        AND a.attnum > 0 AND NOT a.attisdropped
    ), foreign_relations AS (
      SELECT c.oid, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('${OPS_ADMIN_PROJECTION_READER_SCHEMA}', 'pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r', 'p', 'S')
    )
    SELECT
      EXISTS (SELECT 1 FROM role_state WHERE NOT (
        rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR
        rolreplication OR rolbypassrls
      ) AND read_only != '') AS "restrictedReadOnly",
      NOT EXISTS (SELECT 1 FROM pg_auth_members membership, role_state r
        WHERE membership.member = r.oid) AS "noMemberships",
      NOT EXISTS (SELECT 1 FROM owned) AS "noOwnership",
      NOT EXISTS (
        SELECT 1 FROM ops_relations relation
        WHERE relation.relkind IN ('r', 'p')
          AND has_any_column_privilege(
            '${OPS_ADMIN_PROJECTION_READER_ROLE}', relation.oid, 'SELECT'
          ) != (relation.relname = 'cartable_tasks')
      ) AS "exactReads",
      NOT EXISTS (
        SELECT 1 FROM cartable_columns c
        LEFT JOIN expected_columns e USING (column_name)
        WHERE has_column_privilege(
          '${OPS_ADMIN_PROJECTION_READER_ROLE}', c.oid, c.column_name, 'SELECT'
        ) != (e.column_name IS NOT NULL)
      ) AS "exactColumns",
      NOT EXISTS (
        SELECT 1 FROM cartable_columns c
        WHERE c.column_name = ANY(ARRAY[${deniedColumns}])
          AND has_column_privilege(
            '${OPS_ADMIN_PROJECTION_READER_ROLE}', c.oid, c.column_name, 'SELECT'
          )
      ) AS "noControlColumns",
      NOT EXISTS (
        SELECT 1 FROM ops_relations relation
        WHERE relation.relname = ANY(ARRAY[${controlTables}])
          AND (
            has_any_column_privilege(
              '${OPS_ADMIN_PROJECTION_READER_ROLE}', relation.oid, 'SELECT'
            )
            OR has_table_privilege(
              '${OPS_ADMIN_PROJECTION_READER_ROLE}', relation.oid,
              'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
            )
          )
      ) AS "noControlTables",
      NOT EXISTS (
        SELECT 1 FROM ops_relations relation
        WHERE (relation.relkind IN ('r', 'p') AND has_table_privilege(
          '${OPS_ADMIN_PROJECTION_READER_ROLE}', relation.oid,
          'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )) OR (relation.relkind = 'S' AND has_sequence_privilege(
          '${OPS_ADMIN_PROJECTION_READER_ROLE}', relation.oid, 'USAGE,SELECT,UPDATE'
        ))
      ) AS "noWrites",
      NOT has_database_privilege(
        '${OPS_ADMIN_PROJECTION_READER_ROLE}', current_database(), 'CREATE'
      )
        AND NOT has_database_privilege(
          '${OPS_ADMIN_PROJECTION_READER_ROLE}', current_database(), 'TEMP'
        )
        AND NOT EXISTS (SELECT 1 FROM pg_namespace n
          WHERE has_schema_privilege(
            '${OPS_ADMIN_PROJECTION_READER_ROLE}', n.oid, 'CREATE'
          )) AS "noDdl",
      NOT EXISTS (SELECT 1 FROM foreign_relations WHERE
        (relkind IN ('r', 'p') AND (
          has_any_column_privilege(
            '${OPS_ADMIN_PROJECTION_READER_ROLE}', oid, 'SELECT,INSERT,UPDATE'
          ) OR
          has_table_privilege(
            '${OPS_ADMIN_PROJECTION_READER_ROLE}', oid, 'DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
        )) OR (relkind = 'S' AND has_sequence_privilege(
          '${OPS_ADMIN_PROJECTION_READER_ROLE}', oid, 'USAGE,SELECT,UPDATE'
        ))) AS "noCrossDomainAccess",
      NOT EXISTS (
        SELECT 1 FROM pg_database d
        WHERE d.datallowconn AND NOT d.datistemplate
          AND d.datname <> current_database()
          AND has_database_privilege(
            '${OPS_ADMIN_PROJECTION_READER_ROLE}', d.oid, 'CONNECT'
          )
      ) AS "noForeignConnect"`);
    const checks = verification.rows[0];
    if (
      !checks ||
      [
        'restrictedReadOnly',
        'noMemberships',
        'noOwnership',
        'exactReads',
        'exactColumns',
        'noControlColumns',
        'noControlTables',
        'noWrites',
        'noDdl',
        'noCrossDomainAccess',
        'noForeignConnect',
      ].some((key) => checks[key] !== true)
    ) {
      throw new Error(
        'Ops/Admin projection reader database role verification failed',
      );
    }

    await client.query('COMMIT');
    return {
      status: 'PASS',
      role: OPS_ADMIN_PROJECTION_READER_ROLE,
      relationCount: 1,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  const ownerUrl = process.env.OPS_ADMIN_PROJECTION_DATABASE_OWNER_URL;
  const password = process.env.OPS_ADMIN_PROJECTION_READER_PASSWORD;
  if (!ownerUrl || !password) {
    throw new Error(
      'OPS_ADMIN_PROJECTION_DATABASE_OWNER_URL and OPS_ADMIN_PROJECTION_READER_PASSWORD are required',
    );
  }
  const parsed = parseOpsAdminProjectionOwnerUrl(ownerUrl);
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const report = await provisionOpsAdminProjectionReaderRole(
      client,
      password,
      parsed.databaseName,
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write(
      'Ops/Admin projection reader role provisioning failed\n',
    );
    process.exitCode = 1;
  });
}
