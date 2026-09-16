import 'dotenv/config';
import { Client } from 'pg';
import type { RuntimeRoleSqlClient } from './provision-core-runtime-role';

export const AGENCY_PROJECTION_RUNTIME_ROLE =
  'blujet_agency_projection_runtime';
export const AGENCY_PROJECTION_RUNTIME_SCHEMA = 'agency';
export const AGENCY_PROJECTION_RUNTIME_GRANTS = [
  {
    table: 'agency_profiles',
    privileges: 'SELECT, INSERT, UPDATE',
    forbidUpdate: false,
  },
  {
    table: 'agency_invoices',
    privileges: 'SELECT, INSERT, UPDATE',
    forbidUpdate: false,
  },
  {
    table: 'agency_credit_requests',
    privileges: 'SELECT, INSERT, UPDATE',
    forbidUpdate: false,
  },
  {
    table: 'agency_projection_event_receipts',
    privileges: 'SELECT, INSERT',
    forbidUpdate: true,
  },
  {
    table: 'agency_projection_slots',
    privileges: 'SELECT, INSERT, UPDATE',
    forbidUpdate: false,
  },
  {
    table: 'kafka_consumer_checkpoints',
    privileges: 'SELECT, INSERT, UPDATE',
    forbidUpdate: false,
  },
  {
    table: 'kafka_processing_failures',
    privileges: 'SELECT, INSERT, UPDATE',
    forbidUpdate: false,
  },
] as const;
export const AGENCY_PROJECTION_RUNTIME_TABLES =
  AGENCY_PROJECTION_RUNTIME_GRANTS.map((grant) => grant.table);
export const AGENCY_PROJECTION_DATABASE_NAME_PATTERN =
  /^blujet_agency(?:_[A-Za-z0-9_]+)?$/;
export const AGENCY_PROJECTION_MIN_SERVER_VERSION = 160000;

const FOREIGN_SCHEMAS = [
  'public',
  'identity',
  'inventory',
  'orders',
  'payments',
  'loyalty',
  'notify',
  'experience',
  'ops',
  'audit',
  'reporting',
] as const;

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function validateAgencyProjectionRuntimePassword(
  password: string,
): void {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(password)) {
    throw new Error(
      'AGENCY_PROJECTION_RUNTIME_PASSWORD must be 32-128 URL-safe characters',
    );
  }
}

export function validateAgencyProjectionDatabaseName(
  databaseName: string,
): void {
  if (!AGENCY_PROJECTION_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      'Agency projection owner URL must target an isolated Agency database',
    );
  }
}

export function parseAgencyProjectionOwnerUrl(ownerUrl: string): {
  databaseName: string;
  username: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(ownerUrl);
  } catch {
    throw new Error('AGENCY_PROJECTION_DATABASE_OWNER_URL must be PostgreSQL');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('AGENCY_PROJECTION_DATABASE_OWNER_URL must be PostgreSQL');
  }
  const username = decodeURIComponent(parsed.username);
  if (username === AGENCY_PROJECTION_RUNTIME_ROLE) {
    throw new Error('Database owner must differ from the runtime role');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (databaseName.includes('/')) {
    throw new Error('AGENCY_PROJECTION_DATABASE_OWNER_URL must be PostgreSQL');
  }
  validateAgencyProjectionDatabaseName(databaseName);
  return { databaseName, username };
}

export async function provisionAgencyProjectionRuntimeRole(
  client: RuntimeRoleSqlClient,
  password: string,
  expectedDatabaseName?: string,
): Promise<{ status: 'PASS'; role: string; relationCount: number }> {
  validateAgencyProjectionRuntimePassword(password);
  const role = identifier(AGENCY_PROJECTION_RUNTIME_ROLE);
  const schema = identifier(AGENCY_PROJECTION_RUNTIME_SCHEMA);
  const allowedTables =
    AGENCY_PROJECTION_RUNTIME_TABLES.map(literal).join(', ');
  const allowedGrantValues = AGENCY_PROJECTION_RUNTIME_GRANTS.map(
    (grant) =>
      `(${literal(grant.table)}::text, ${literal(grant.privileges.replaceAll(' ', ''))}::text, ${grant.forbidUpdate})`,
  ).join(', ');

  await client.query('BEGIN');
  try {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${AGENCY_PROJECTION_RUNTIME_ROLE}') THEN
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
        'PostgreSQL could not prepare the Agency projection runtime credential',
      );
    }
    await client.query(passwordStatement);
    await client.query(`ALTER ROLE ${role}
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await client.query(`ALTER ROLE ${role} RESET ALL`);
    await client.query(`DO $$ DECLARE parent_role record; BEGIN
      FOR parent_role IN
        SELECT parent.rolname
        FROM pg_auth_members membership
        JOIN pg_roles member ON member.oid = membership.member
        JOIN pg_roles parent ON parent.oid = membership.roleid
        WHERE member.rolname = '${AGENCY_PROJECTION_RUNTIME_ROLE}'
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
    if (version < AGENCY_PROJECTION_MIN_SERVER_VERSION) {
      throw new Error('Agency projection runtime requires PostgreSQL 16');
    }
    validateAgencyProjectionDatabaseName(databaseName);
    if (
      expectedDatabaseName !== undefined &&
      expectedDatabaseName !== databaseName
    ) {
      throw new Error(
        'Agency projection owner URL must target an isolated Agency database',
      );
    }
    const databaseIdentifier = identifier(databaseName);

    const required = await client.query(
      `SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${AGENCY_PROJECTION_RUNTIME_SCHEMA}'
        AND c.relkind IN ('r', 'p')
        AND c.relname = ANY(ARRAY[${allowedTables}])`,
    );
    if (required.rows.length !== AGENCY_PROJECTION_RUNTIME_TABLES.length) {
      throw new Error('Agency projection runtime relations are missing');
    }

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
          AND r.rolname <> '${AGENCY_PROJECTION_RUNTIME_ROLE}';
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
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM ${role}', foreign_schema.nspname);
        EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM ${role}', foreign_schema.nspname);
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
    for (const grant of AGENCY_PROJECTION_RUNTIME_GRANTS) {
      await client.query(
        `GRANT ${grant.privileges} ON TABLE ${schema}.${identifier(grant.table)} TO ${role}`,
      );
    }
    await client.query(
      `ALTER ROLE ${role} IN DATABASE ${databaseIdentifier} SET search_path = ${schema}, pg_catalog`,
    );

    const verification = await client.query(`WITH role_state AS (
      SELECT oid, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
        rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = '${AGENCY_PROJECTION_RUNTIME_ROLE}'
    ), owned AS (
      SELECT 1 FROM pg_class c, role_state r WHERE c.relowner = r.oid
      UNION ALL
      SELECT 1 FROM pg_namespace n, role_state r WHERE n.nspowner = r.oid
      UNION ALL
      SELECT 1 FROM pg_database d, role_state r WHERE d.datdba = r.oid
    ), allowed(relname, required, forbid_update) AS (
      VALUES ${allowedGrantValues}
    ), agency_relations AS (
      SELECT c.oid, c.relkind, c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${AGENCY_PROJECTION_RUNTIME_SCHEMA}'
        AND c.relkind IN ('r', 'p', 'S')
    ), foreign_relations AS (
      SELECT c.oid, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('${AGENCY_PROJECTION_RUNTIME_SCHEMA}', 'pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r', 'p', 'S')
    )
    SELECT
      EXISTS (SELECT 1 FROM role_state WHERE NOT (
        rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR
        rolreplication OR rolbypassrls
      )) AS "restrictedRole",
      NOT EXISTS (SELECT 1 FROM pg_auth_members membership, role_state r
        WHERE membership.member = r.oid) AS "noMemberships",
      NOT EXISTS (SELECT 1 FROM owned) AS "noOwnership",
      NOT EXISTS (
        SELECT 1 FROM allowed
        LEFT JOIN agency_relations relation ON relation.relname = allowed.relname
          AND relation.relkind IN ('r', 'p')
        WHERE relation.oid IS NULL
          OR NOT has_table_privilege(
            '${AGENCY_PROJECTION_RUNTIME_ROLE}', relation.oid, allowed.required
          )
          OR (
            allowed.forbid_update
            AND has_table_privilege(
              '${AGENCY_PROJECTION_RUNTIME_ROLE}', relation.oid, 'UPDATE'
            )
          )
      ) AS "ownAccess",
      NOT EXISTS (
        SELECT 1 FROM agency_relations relation
        LEFT JOIN allowed ON allowed.relname = relation.relname
        WHERE (relation.relkind IN ('r', 'p') AND (
          (
            allowed.relname IS NOT NULL
            AND (
              has_table_privilege(
                '${AGENCY_PROJECTION_RUNTIME_ROLE}', relation.oid, 'DELETE'
              )
              OR has_table_privilege(
                '${AGENCY_PROJECTION_RUNTIME_ROLE}', relation.oid, 'TRUNCATE'
              )
              OR has_table_privilege(
                '${AGENCY_PROJECTION_RUNTIME_ROLE}', relation.oid, 'REFERENCES'
              )
              OR has_table_privilege(
                '${AGENCY_PROJECTION_RUNTIME_ROLE}', relation.oid, 'TRIGGER'
              )
              OR (
                allowed.forbid_update
                AND has_table_privilege(
                  '${AGENCY_PROJECTION_RUNTIME_ROLE}', relation.oid, 'UPDATE'
                )
              )
            )
          ) OR (
            allowed.relname IS NULL
            AND (
              has_any_column_privilege(
                '${AGENCY_PROJECTION_RUNTIME_ROLE}', relation.oid,
                'SELECT,INSERT,UPDATE'
              )
              OR has_table_privilege(
                '${AGENCY_PROJECTION_RUNTIME_ROLE}', relation.oid, 'DELETE'
              )
              OR has_table_privilege(
                '${AGENCY_PROJECTION_RUNTIME_ROLE}', relation.oid, 'TRUNCATE'
              )
              OR has_table_privilege(
                '${AGENCY_PROJECTION_RUNTIME_ROLE}', relation.oid, 'REFERENCES'
              )
              OR has_table_privilege(
                '${AGENCY_PROJECTION_RUNTIME_ROLE}', relation.oid, 'TRIGGER'
              )
            )
          )
        )) OR (relation.relkind = 'S' AND has_sequence_privilege(
          '${AGENCY_PROJECTION_RUNTIME_ROLE}', relation.oid, 'USAGE,SELECT,UPDATE'
        ))
      ) AS "leastPrivilege",
      NOT EXISTS (SELECT 1 FROM foreign_relations WHERE
        (relkind IN ('r', 'p') AND (
          has_any_column_privilege(
            '${AGENCY_PROJECTION_RUNTIME_ROLE}', oid, 'SELECT,INSERT,UPDATE'
          ) OR
          has_table_privilege(
            '${AGENCY_PROJECTION_RUNTIME_ROLE}', oid, 'DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
        )) OR (relkind = 'S' AND has_sequence_privilege(
          '${AGENCY_PROJECTION_RUNTIME_ROLE}', oid, 'USAGE,SELECT,UPDATE'
        ))) AS "noCrossDomainAccess",
      NOT has_database_privilege(
        '${AGENCY_PROJECTION_RUNTIME_ROLE}', current_database(), 'CREATE'
      )
        AND NOT has_database_privilege(
          '${AGENCY_PROJECTION_RUNTIME_ROLE}', current_database(), 'TEMP'
        )
        AND NOT EXISTS (SELECT 1 FROM pg_namespace n
          WHERE has_schema_privilege(
            '${AGENCY_PROJECTION_RUNTIME_ROLE}', n.oid, 'CREATE'
          )) AS "noDdl",
      NOT EXISTS (
        SELECT 1 FROM pg_database d
        WHERE d.datallowconn AND NOT d.datistemplate
          AND d.datname <> current_database()
          AND has_database_privilege(
            '${AGENCY_PROJECTION_RUNTIME_ROLE}', d.oid, 'CONNECT'
          )
      ) AS "noForeignConnect"`);
    const checks = verification.rows[0];
    if (
      !checks ||
      [
        'restrictedRole',
        'noMemberships',
        'noOwnership',
        'ownAccess',
        'leastPrivilege',
        'noCrossDomainAccess',
        'noDdl',
        'noForeignConnect',
      ].some((key) => checks[key] !== true)
    ) {
      throw new Error(
        'Agency projection runtime database role verification failed',
      );
    }

    await client.query('COMMIT');
    return {
      status: 'PASS',
      role: AGENCY_PROJECTION_RUNTIME_ROLE,
      relationCount: AGENCY_PROJECTION_RUNTIME_TABLES.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  const ownerUrl = process.env.AGENCY_PROJECTION_DATABASE_OWNER_URL;
  const password = process.env.AGENCY_PROJECTION_RUNTIME_PASSWORD;
  if (!ownerUrl || !password) {
    throw new Error(
      'AGENCY_PROJECTION_DATABASE_OWNER_URL and AGENCY_PROJECTION_RUNTIME_PASSWORD are required',
    );
  }
  const parsed = parseAgencyProjectionOwnerUrl(ownerUrl);
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const report = await provisionAgencyProjectionRuntimeRole(
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
      'Agency projection runtime role provisioning failed\n',
    );
    process.exitCode = 1;
  });
}
