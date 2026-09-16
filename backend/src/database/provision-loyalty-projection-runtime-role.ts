import 'dotenv/config';
import { Client } from 'pg';

export const LOYALTY_PROJECTION_RUNTIME_ROLE =
  'blujet_loyalty_projection_runtime';
export const LOYALTY_DATABASE_NAME_PATTERN =
  /^blujet_loyalty(?:_[A-Za-z0-9_]+)?$/;
export const LOYALTY_MIN_SERVER_VERSION = 160000;

export const LOYALTY_RUNTIME_GRANTS = [
  { table: 'club_members', privileges: ['SELECT', 'INSERT', 'UPDATE'] },
  {
    table: 'club_points_entries',
    privileges: ['SELECT', 'INSERT', 'UPDATE'],
  },
  {
    table: 'club_card_requests',
    privileges: ['SELECT', 'INSERT', 'UPDATE'],
  },
  {
    table: 'club_tier_rules',
    privileges: ['SELECT', 'INSERT', 'UPDATE'],
  },
  { table: 'price_locks', privileges: ['SELECT', 'INSERT', 'UPDATE'] },
  {
    table: 'customer_referrals',
    privileges: ['SELECT', 'INSERT', 'UPDATE'],
  },
  {
    table: 'loyalty_projection_event_receipts',
    privileges: ['SELECT', 'INSERT'],
  },
  {
    table: 'loyalty_projection_slots',
    privileges: ['SELECT', 'INSERT', 'UPDATE'],
  },
  {
    table: 'kafka_consumer_checkpoints',
    privileges: ['SELECT', 'INSERT', 'UPDATE'],
  },
  {
    table: 'kafka_processing_failures',
    privileges: ['SELECT', 'INSERT', 'UPDATE'],
  },
] as const;

type LoyaltyRuntimeGrant = {
  table: string;
  privileges: readonly string[];
};

const FORBIDDEN_TABLE_PRIVILEGES = [
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
] as const;

export interface LoyaltyRuntimeRoleSqlClient {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function validateLoyaltyRuntimePassword(password: string): void {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(password)) {
    throw new Error(
      'LOYALTY_PROJECTION_RUNTIME_PASSWORD must be 32-128 URL-safe characters',
    );
  }
}

export function validateLoyaltyDatabaseName(databaseName: string): void {
  if (!LOYALTY_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      'Loyalty owner URL must target an isolated Loyalty database',
    );
  }
}

export function parseLoyaltyOwnerUrl(ownerUrl: string): {
  databaseName: string;
  username: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(ownerUrl);
  } catch {
    throw new Error('LOYALTY_PROJECTION_DATABASE_OWNER_URL must be PostgreSQL');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('LOYALTY_PROJECTION_DATABASE_OWNER_URL must be PostgreSQL');
  }
  const username = decodeURIComponent(parsed.username);
  if (!username || username === LOYALTY_PROJECTION_RUNTIME_ROLE) {
    throw new Error('Loyalty database owner must differ from the runtime role');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!databaseName || databaseName.includes('/')) {
    throw new Error('LOYALTY_PROJECTION_DATABASE_OWNER_URL must be PostgreSQL');
  }
  validateLoyaltyDatabaseName(databaseName);
  return { databaseName, username };
}

function expectedTablesSql(): string {
  return LOYALTY_RUNTIME_GRANTS.map(({ table }) => literal(table)).join(', ');
}

function allowedPrivilegesSql(): string {
  const grants: readonly LoyaltyRuntimeGrant[] = LOYALTY_RUNTIME_GRANTS;
  return grants
    .flatMap(({ table, privileges }) =>
      privileges.map(
        (privilege) => `(${literal(table)}::text, ${literal(privilege)}::text)`,
      ),
    )
    .join(', ');
}

async function assertLoyaltySchema(
  client: LoyaltyRuntimeRoleSqlClient,
): Promise<number> {
  const result = await client.query(
    `SELECT c.relname AS name
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'loyalty' AND c.relkind IN ('r', 'p')
     ORDER BY c.relname`,
  );
  const actual = result.rows.map((row) => {
    if (typeof row.name !== 'string') {
      throw new Error('Loyalty runtime relation contract does not match');
    }
    return row.name;
  });
  const expected = LOYALTY_RUNTIME_GRANTS.map(({ table }) => table).sort();
  if (
    actual.length !== expected.length ||
    actual.some((table, index) => table !== expected[index])
  ) {
    throw new Error('Loyalty runtime relation contract does not match');
  }
  return actual.length;
}

async function verifyLoyaltyRuntimeRole(
  client: LoyaltyRuntimeRoleSqlClient,
  databaseName: string,
): Promise<void> {
  const allowed = allowedPrivilegesSql();
  const forbidden = FORBIDDEN_TABLE_PRIVILEGES.map(literal).join(', ');
  const expectedTables = expectedTablesSql();
  const result = await client.query(`WITH role_state AS (
      SELECT oid, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
        rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = '${LOYALTY_PROJECTION_RUNTIME_ROLE}'
    ), loyalty_relations AS (
      SELECT c.oid, c.relname, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'loyalty' AND c.relkind IN ('r', 'p', 'S')
    ), foreign_relations AS (
      SELECT c.oid, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('loyalty', 'pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
        AND c.relkind IN ('r', 'p', 'S')
    ), owned AS (
      SELECT 1 FROM pg_class c, role_state r WHERE c.relowner = r.oid
      UNION ALL
      SELECT 1 FROM pg_namespace n, role_state r WHERE n.nspowner = r.oid
      UNION ALL
      SELECT 1 FROM pg_database d, role_state r WHERE d.datdba = r.oid
    ), allowed(table_name, privilege_type) AS (
      VALUES ${allowed}
    )
    SELECT
      EXISTS (SELECT 1 FROM role_state WHERE NOT (
        rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR
        rolreplication OR rolbypassrls
      )) AS "restrictedRole",
      NOT EXISTS (
        SELECT 1 FROM pg_auth_members membership, role_state role
        WHERE membership.member = role.oid
      ) AS "noMemberships",
      NOT EXISTS (SELECT 1 FROM owned) AS "noOwnership",
      has_database_privilege(
        '${LOYALTY_PROJECTION_RUNTIME_ROLE}', ${literal(databaseName)}, 'CONNECT'
      ) AND NOT has_database_privilege(
        '${LOYALTY_PROJECTION_RUNTIME_ROLE}', ${literal(databaseName)}, 'CREATE,TEMP'
      ) AS "databaseAccess",
      has_schema_privilege(
        '${LOYALTY_PROJECTION_RUNTIME_ROLE}', 'loyalty', 'USAGE'
      ) AND NOT has_schema_privilege(
        '${LOYALTY_PROJECTION_RUNTIME_ROLE}', 'loyalty', 'CREATE'
      ) AS "schemaAccess",
      NOT EXISTS (
        SELECT 1 FROM allowed
        LEFT JOIN loyalty_relations relation
          ON relation.relname = allowed.table_name AND relation.relkind IN ('r', 'p')
        WHERE relation.oid IS NULL OR NOT has_table_privilege(
          '${LOYALTY_PROJECTION_RUNTIME_ROLE}', relation.oid,
          allowed.privilege_type
        )
      ) AS "requiredGrants",
      NOT EXISTS (
        SELECT 1 FROM loyalty_relations relation
        WHERE relation.relkind IN ('r', 'p') AND (
          relation.relname NOT IN (${expectedTables}) AND
          has_any_column_privilege(
            '${LOYALTY_PROJECTION_RUNTIME_ROLE}', relation.oid,
            'SELECT,INSERT,UPDATE'
          )
          OR EXISTS (
            SELECT 1 FROM unnest(ARRAY[${forbidden}]) privilege
            WHERE has_table_privilege(
              '${LOYALTY_PROJECTION_RUNTIME_ROLE}', relation.oid, privilege
            )
          )
          OR relation.relname = 'loyalty_projection_event_receipts' AND
            has_any_column_privilege(
              '${LOYALTY_PROJECTION_RUNTIME_ROLE}', relation.oid, 'UPDATE'
            )
        ) OR relation.relkind = 'S' AND has_sequence_privilege(
          '${LOYALTY_PROJECTION_RUNTIME_ROLE}', relation.oid,
          'USAGE,SELECT,UPDATE'
        )
      ) AS "leastPrivilege",
      NOT EXISTS (
        SELECT 1 FROM foreign_relations relation
        WHERE relation.relkind IN ('r', 'p') AND (
          has_any_column_privilege(
            '${LOYALTY_PROJECTION_RUNTIME_ROLE}', relation.oid,
            'SELECT,INSERT,UPDATE'
          ) OR has_table_privilege(
            '${LOYALTY_PROJECTION_RUNTIME_ROLE}', relation.oid,
            'DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
        ) OR relation.relkind = 'S' AND has_sequence_privilege(
          '${LOYALTY_PROJECTION_RUNTIME_ROLE}', relation.oid,
          'USAGE,SELECT,UPDATE'
        )
      ) AS "noCrossDomainAccess",
      NOT EXISTS (
        SELECT 1 FROM pg_database database
        WHERE database.datallowconn AND NOT database.datistemplate
          AND database.datname <> ${literal(databaseName)}
          AND has_database_privilege(
            '${LOYALTY_PROJECTION_RUNTIME_ROLE}', database.oid, 'CONNECT'
          )
      ) AS "noForeignConnect"`);
  const checks = result.rows[0];
  if (
    !checks ||
    [
      'restrictedRole',
      'noMemberships',
      'noOwnership',
      'databaseAccess',
      'schemaAccess',
      'requiredGrants',
      'leastPrivilege',
      'noCrossDomainAccess',
      'noForeignConnect',
    ].some((key) => checks[key] !== true)
  ) {
    throw new Error('Loyalty projection runtime role verification failed');
  }
}

export async function provisionLoyaltyProjectionRuntimeRole(
  client: LoyaltyRuntimeRoleSqlClient,
  password: string,
  expectedDatabaseName?: string,
): Promise<{ status: 'PASS'; role: string; relationCount: number }> {
  validateLoyaltyRuntimePassword(password);
  const role = identifier(LOYALTY_PROJECTION_RUNTIME_ROLE);
  await client.query('BEGIN');
  try {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = '${LOYALTY_PROJECTION_RUNTIME_ROLE}'
      ) THEN CREATE ROLE ${role} LOGIN; END IF;
    END $$`);
    const passwordSql = await client.query(
      `SELECT format('ALTER ROLE ${role} PASSWORD %L', $1::text) AS statement`,
      [password],
    );
    const statement = passwordSql.rows[0]?.statement;
    if (typeof statement !== 'string') {
      throw new Error('PostgreSQL could not prepare the Loyalty credential');
    }
    await client.query(statement);
    await client.query(`ALTER ROLE ${role}
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await client.query(`ALTER ROLE ${role} RESET ALL`);
    await client.query(`DO $$ DECLARE parent_role record; BEGIN
      FOR parent_role IN
        SELECT parent.rolname FROM pg_auth_members membership
        JOIN pg_roles member ON member.oid = membership.member
        JOIN pg_roles parent ON parent.oid = membership.roleid
        WHERE member.rolname = '${LOYALTY_PROJECTION_RUNTIME_ROLE}'
      LOOP EXECUTE format('REVOKE %I FROM ${role}', parent_role.rolname);
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
    validateLoyaltyDatabaseName(databaseName);
    if (version < LOYALTY_MIN_SERVER_VERSION) {
      throw new Error('Loyalty projection runtime requires PostgreSQL 16');
    }
    if (
      expectedDatabaseName !== undefined &&
      databaseName !== expectedDatabaseName
    ) {
      throw new Error(
        'Loyalty owner URL must target an isolated Loyalty database',
      );
    }
    const relationCount = await assertLoyaltySchema(client);
    const database = identifier(databaseName);

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
          AND r.rolname <> '${LOYALTY_PROJECTION_RUNTIME_ROLE}';
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
    await client.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    await client.query(`REVOKE ALL ON DATABASE ${database} FROM ${role}`);
    await client.query(`GRANT CONNECT ON DATABASE ${database} TO CURRENT_USER`);
    await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
    await client.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await client.query(`REVOKE ALL ON SCHEMA public FROM ${role}`);
    await client.query(`REVOKE ALL ON SCHEMA loyalty FROM ${role}`);
    await client.query(`GRANT USAGE ON SCHEMA loyalty TO ${role}`);
    await client.query(
      `REVOKE ALL ON ALL TABLES IN SCHEMA loyalty FROM ${role}`,
    );
    await client.query(
      `REVOKE ALL ON ALL SEQUENCES IN SCHEMA loyalty FROM ${role}`,
    );
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA loyalty
      REVOKE ALL ON TABLES FROM ${role}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA loyalty
      REVOKE ALL ON SEQUENCES FROM ${role}`);
    for (const grant of LOYALTY_RUNTIME_GRANTS) {
      await client.query(
        `GRANT ${grant.privileges.join(', ')} ON loyalty.${identifier(grant.table)} TO ${role}`,
      );
    }
    await client.query(`ALTER ROLE ${role} IN DATABASE ${database}
      SET search_path = loyalty, pg_catalog`);
    await client.query(`ALTER ROLE ${role} IN DATABASE ${database}
      SET timezone = 'UTC'`);
    await client.query(`ALTER ROLE ${role} IN DATABASE ${database}
      SET statement_timeout = '5s'`);
    await client.query(`ALTER ROLE ${role} IN DATABASE ${database}
      SET lock_timeout = '2s'`);
    await verifyLoyaltyRuntimeRole(client, databaseName);
    await client.query('COMMIT');
    return {
      status: 'PASS',
      role: LOYALTY_PROJECTION_RUNTIME_ROLE,
      relationCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  const ownerUrl = process.env.LOYALTY_PROJECTION_DATABASE_OWNER_URL;
  const password = process.env.LOYALTY_PROJECTION_RUNTIME_PASSWORD;
  if (!ownerUrl || !password) {
    throw new Error(
      'LOYALTY_PROJECTION_DATABASE_OWNER_URL and LOYALTY_PROJECTION_RUNTIME_PASSWORD are required',
    );
  }
  const parsed = parseLoyaltyOwnerUrl(ownerUrl);
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const report = await provisionLoyaltyProjectionRuntimeRole(
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
      'Loyalty projection runtime role provisioning failed\n',
    );
    process.exitCode = 1;
  });
}
