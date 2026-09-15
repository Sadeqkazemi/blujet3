import 'dotenv/config';
import { Client } from 'pg';
import {
  REPORTING_DATABASE_NAME_PATTERN,
  REPORTING_MIN_SERVER_VERSION,
  REPORTING_PROJECTION_RUNTIME_ROLE,
  validateReportingDatabaseName,
} from './provision-reporting-projection-runtime-role';

export const REPORTING_CUTOVER_SOURCE_ROLE = 'blujet_reporting_cutover_source';
export const REPORTING_CUTOVER_TARGET_ROLE = 'blujet_reporting_cutover_target';
export const REPORTING_CUTOVER_READER_SCHEMA = 'reporting';

export type ReportingCutoverReaderKind = 'source' | 'target';

export const REPORTING_CUTOVER_READER_GRANTS = [
  {
    table: 'core_itinerary_event_projections',
    columns: [
      'orderId',
      'eventType',
      'eventId',
      'fingerprint',
      'orderVersion',
      'currency',
      'occurredAt',
      'createdAt',
      'updatedAt',
    ],
  },
  {
    table: 'core_itinerary_event_receipts',
    columns: [
      'eventId',
      'fingerprint',
      'orderId',
      'eventType',
      'orderVersion',
      'receivedAt',
    ],
  },
  {
    table: 'kafka_processing_failures',
    columns: ['consumerGroup', 'topic', 'status'],
  },
  {
    table: 'kafka_consumer_checkpoints',
    columns: [
      'consumerGroup',
      'topic',
      'partition',
      'nextOffset',
      'highWatermark',
    ],
  },
] as const;

export const REPORTING_CUTOVER_DENIED_COLUMNS = ['payload'] as const;

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
  'ops',
] as const;

export interface ReportingCutoverReaderSqlClient {
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

function roleName(kind: ReportingCutoverReaderKind): string {
  return kind === 'source'
    ? REPORTING_CUTOVER_SOURCE_ROLE
    : REPORTING_CUTOVER_TARGET_ROLE;
}

function passwordEnvName(kind: ReportingCutoverReaderKind): string {
  return kind === 'source'
    ? 'REPORTING_CUTOVER_SOURCE_PASSWORD'
    : 'REPORTING_CUTOVER_TARGET_PASSWORD';
}

function ownerUrlEnvName(kind: ReportingCutoverReaderKind): string {
  return kind === 'source'
    ? 'REPORTING_CUTOVER_SOURCE_OWNER_URL'
    : 'REPORTING_CUTOVER_TARGET_OWNER_URL';
}

function databaseIdentity(url: URL): string {
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}${url.pathname}`;
}

function databaseServerIdentity(url: URL): string {
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}`;
}

export function parseReportingCutoverReaderKind(
  value: string | undefined,
): ReportingCutoverReaderKind {
  if (value === 'source' || value === 'target') return value;
  throw new Error('Reporting cutover reader kind is invalid');
}

export function validateReportingCutoverReaderPassword(
  password: string,
  kind: ReportingCutoverReaderKind,
): void {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(password)) {
    throw new Error(
      `${passwordEnvName(kind)} must be 32-128 URL-safe characters`,
    );
  }
}

export function validateReportingCutoverSourceDatabaseName(
  databaseName: string,
): void {
  if (REPORTING_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      'Reporting cutover source owner URL must target Core/shared PostgreSQL',
    );
  }
}

function parsePostgresUrl(ownerUrl: string, envName: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(ownerUrl);
  } catch {
    throw new Error(`${envName} must be PostgreSQL`);
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`${envName} must be PostgreSQL`);
  }
  return parsed;
}

export function parseReportingCutoverOwnerUrl(
  ownerUrl: string,
  kind: ReportingCutoverReaderKind,
): { databaseName: string; username: string; identity: string } {
  const parsed = parsePostgresUrl(ownerUrl, ownerUrlEnvName(kind));
  const username = decodeURIComponent(parsed.username);
  const forbidden = new Set([
    REPORTING_CUTOVER_SOURCE_ROLE,
    REPORTING_CUTOVER_TARGET_ROLE,
    REPORTING_PROJECTION_RUNTIME_ROLE,
  ]);
  if (!username || forbidden.has(username)) {
    throw new Error(
      'Reporting cutover owner must differ from the reader and runtime roles',
    );
  }
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\//, ''),
  ).split('?')[0];
  if (!databaseName || databaseName.includes('/')) {
    throw new Error(`${ownerUrlEnvName(kind)} must be PostgreSQL`);
  }
  if (kind === 'source') {
    validateReportingCutoverSourceDatabaseName(databaseName);
  } else {
    validateReportingDatabaseName(databaseName);
  }
  return {
    databaseName,
    username,
    identity: databaseIdentity(parsed),
  };
}

export function classifyReportingCutoverOwnerUrls(
  sourceUrl: string,
  targetUrl: string,
): {
  sourceDatabaseName: string;
  targetDatabaseName: string;
  sharesDatabaseServer: boolean;
} {
  const sourceParsed = parsePostgresUrl(sourceUrl, ownerUrlEnvName('source'));
  const targetParsed = parsePostgresUrl(targetUrl, ownerUrlEnvName('target'));
  if (databaseIdentity(sourceParsed) === databaseIdentity(targetParsed)) {
    throw new Error(
      'Reporting cutover reader owner URLs must target distinct databases',
    );
  }
  const source = parseReportingCutoverOwnerUrl(sourceUrl, 'source');
  const target = parseReportingCutoverOwnerUrl(targetUrl, 'target');
  return {
    sourceDatabaseName: source.databaseName,
    targetDatabaseName: target.databaseName,
    sharesDatabaseServer:
      databaseServerIdentity(sourceParsed) ===
      databaseServerIdentity(targetParsed),
  };
}

function expectedColumnsSql(): string {
  return REPORTING_CUTOVER_READER_GRANTS.flatMap(({ table, columns }) =>
    columns.map(
      (column: string) => `(${literal(table)}::text, ${literal(column)}::text)`,
    ),
  ).join(', ');
}

function expectedTablesSql(): string {
  return REPORTING_CUTOVER_READER_GRANTS.map(({ table }) =>
    literal(table),
  ).join(', ');
}

async function assertReportingSchema(
  client: ReportingCutoverReaderSqlClient,
): Promise<number> {
  const result = await client.query(
    `SELECT c.relname AS name
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'reporting' AND c.relkind IN ('r', 'p')
     ORDER BY c.relname`,
  );
  const actual = result.rows.map((row) => {
    if (typeof row.name !== 'string') {
      throw new Error(
        'Reporting cutover reader relation contract does not match',
      );
    }
    return row.name;
  });
  const expected = REPORTING_CUTOVER_READER_GRANTS.map(({ table }) => table)
    .slice()
    .sort();
  if (
    actual.length !== expected.length ||
    actual.some((table, index) => table !== expected[index])
  ) {
    throw new Error(
      'Reporting cutover reader relation contract does not match',
    );
  }
  return actual.length;
}

async function verifyReportingCutoverReaderRole(
  client: ReportingCutoverReaderSqlClient,
  role: string,
  databaseName: string,
  counterpartDatabaseName?: string,
): Promise<void> {
  const expectedTables = expectedTablesSql();
  const expectedColumns = expectedColumnsSql();
  const deniedColumns =
    REPORTING_CUTOVER_DENIED_COLUMNS.map(literal).join(', ');
  const noCounterpartConnectSql = counterpartDatabaseName
    ? `NOT has_database_privilege(
          ${literal(role)}, ${literal(counterpartDatabaseName)}, 'CONNECT'
        )`
    : 'true';
  const result = await client.query(`WITH role_state AS (
      SELECT oid, rolcanlogin, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
        rolreplication, rolbypassrls, coalesce(rolconfig, ARRAY[]::text[]) AS config
      FROM pg_roles WHERE rolname = ${literal(role)}
    ), reporting_relations AS (
      SELECT c.oid, c.relname, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'reporting' AND c.relkind IN ('r', 'p', 'S')
    ), reporting_columns AS (
      SELECT c.oid, c.relname, a.attname AS column_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'reporting' AND c.relkind IN ('r', 'p')
        AND a.attnum > 0 AND NOT a.attisdropped
    ), expected(table_name, column_name) AS (
      VALUES ${expectedColumns}
    ), foreign_relations AS (
      SELECT c.oid, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('reporting', 'pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
        AND c.relkind IN ('r', 'p', 'S')
    ), owned AS (
      SELECT 1 FROM pg_class c, role_state r WHERE c.relowner = r.oid
      UNION ALL
      SELECT 1 FROM pg_namespace n, role_state r WHERE n.nspowner = r.oid
      UNION ALL
      SELECT 1 FROM pg_database d, role_state r WHERE d.datdba = r.oid
    )
    SELECT
      EXISTS (SELECT 1 FROM role_state WHERE NOT (
        rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR
        rolreplication OR rolbypassrls
      ) AND rolcanlogin
        AND 'default_transaction_read_only=on' = ANY(config)
        AND 'TimeZone=UTC' = ANY(config)
        AND 'statement_timeout=5s' = ANY(config)
        AND 'lock_timeout=2s' = ANY(config)
      ) AS "restrictedReadOnly",
      NOT EXISTS (
        SELECT 1 FROM pg_auth_members membership, role_state role
        WHERE membership.member = role.oid
      ) AS "noMemberships",
      NOT EXISTS (SELECT 1 FROM owned) AS "noOwnership",
      has_database_privilege(${literal(role)}, ${literal(databaseName)}, 'CONNECT')
        AND NOT has_database_privilege(
          ${literal(role)}, ${literal(databaseName)}, 'CREATE,TEMP'
        ) AS "databaseAccess",
      has_schema_privilege(${literal(role)}, 'reporting', 'USAGE')
        AND NOT has_schema_privilege(${literal(role)}, 'reporting', 'CREATE')
        AS "schemaAccess",
      NOT EXISTS (
        SELECT 1 FROM pg_namespace namespace
        WHERE namespace.nspname NOT IN (
          'reporting', 'pg_catalog', 'information_schema'
        )
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND has_schema_privilege(
            ${literal(role)}, namespace.oid, 'USAGE,CREATE'
          )
      ) AS "noForeignSchemaAccess",
      NOT EXISTS (
        SELECT 1 FROM reporting_relations relation
        WHERE relation.relkind IN ('r', 'p')
          AND has_any_column_privilege(
            ${literal(role)}, relation.oid, 'SELECT'
          ) != (relation.relname IN (${expectedTables}))
      ) AS "exactReads",
      NOT EXISTS (
        SELECT 1 FROM reporting_columns column_row
        LEFT JOIN expected
          ON expected.table_name = column_row.relname
         AND expected.column_name = column_row.column_name
        WHERE has_column_privilege(
          ${literal(role)}, column_row.oid, column_row.column_name, 'SELECT'
        ) != (expected.column_name IS NOT NULL)
      ) AS "exactColumns",
      NOT EXISTS (
        SELECT 1 FROM reporting_columns column_row
        WHERE column_row.column_name = ANY(ARRAY[${deniedColumns}])
          AND has_column_privilege(
            ${literal(role)}, column_row.oid, column_row.column_name, 'SELECT'
          )
      ) AS "noPayload",
      NOT EXISTS (
        SELECT 1 FROM reporting_relations relation
        WHERE (relation.relkind IN ('r', 'p') AND has_table_privilege(
          ${literal(role)}, relation.oid,
          'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )) OR (relation.relkind = 'S' AND has_sequence_privilege(
          ${literal(role)}, relation.oid, 'USAGE,SELECT,UPDATE'
        ))
      ) AS "noWrites",
      NOT has_database_privilege(${literal(role)}, current_database(), 'CREATE')
        AND NOT has_database_privilege(
          ${literal(role)}, current_database(), 'TEMP'
        )
        AND NOT EXISTS (SELECT 1 FROM pg_namespace n
          WHERE has_schema_privilege(${literal(role)}, n.oid, 'CREATE'))
        AS "noDdl",
      NOT EXISTS (
        SELECT 1 FROM foreign_relations relation
        WHERE relation.relkind IN ('r', 'p') AND (
          has_any_column_privilege(
            ${literal(role)}, relation.oid, 'SELECT,INSERT,UPDATE'
          ) OR has_table_privilege(
            ${literal(role)}, relation.oid, 'DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
        ) OR relation.relkind = 'S' AND has_sequence_privilege(
          ${literal(role)}, relation.oid, 'USAGE,SELECT,UPDATE'
        )
      ) AS "noCrossDomainAccess",
      ${noCounterpartConnectSql} AS "noCounterpartConnect"`);
  const checks = result.rows[0];
  const failed = [
    'restrictedReadOnly',
    'noMemberships',
    'noOwnership',
    'databaseAccess',
    'schemaAccess',
    'noForeignSchemaAccess',
    'exactReads',
    'exactColumns',
    'noPayload',
    'noWrites',
    'noDdl',
    'noCrossDomainAccess',
    'noCounterpartConnect',
  ].filter((key) => checks?.[key] !== true);
  if (failed.length > 0) {
    throw new Error(
      `Reporting cutover reader role verification failed (${failed.join(',')})`,
    );
  }
}

export async function provisionReportingCutoverReaderRole(
  client: ReportingCutoverReaderSqlClient,
  password: string,
  kind: ReportingCutoverReaderKind,
  expectedDatabaseName?: string,
  counterpartDatabaseName?: string,
): Promise<{ status: 'PASS'; role: string; relationCount: number }> {
  validateReportingCutoverReaderPassword(password, kind);
  const role = roleName(kind);
  const quotedRole = identifier(role);
  const schema = identifier(REPORTING_CUTOVER_READER_SCHEMA);
  await client.query('BEGIN');
  try {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = ${literal(role)}
      ) THEN CREATE ROLE ${quotedRole} LOGIN; END IF;
    END $$`);
    const passwordSql = await client.query(
      `SELECT format('ALTER ROLE ${quotedRole} PASSWORD %L', $1::text) AS statement`,
      [password],
    );
    const statement = passwordSql.rows[0]?.statement;
    if (typeof statement !== 'string') {
      throw new Error(
        'PostgreSQL could not prepare the Reporting cutover reader credential',
      );
    }
    await client.query(statement);
    await client.query(`ALTER ROLE ${quotedRole}
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await client.query(`ALTER ROLE ${quotedRole} RESET ALL`);
    await client.query(
      `ALTER ROLE ${quotedRole} SET default_transaction_read_only = on`,
    );
    await client.query(`ALTER ROLE ${quotedRole} SET timezone = 'UTC'`);
    await client.query(`ALTER ROLE ${quotedRole} SET statement_timeout = '5s'`);
    await client.query(`ALTER ROLE ${quotedRole} SET lock_timeout = '2s'`);
    await client.query(`DO $$ DECLARE parent_role record; BEGIN
      FOR parent_role IN
        SELECT parent.rolname FROM pg_auth_members membership
        JOIN pg_roles member ON member.oid = membership.member
        JOIN pg_roles parent ON parent.oid = membership.roleid
        WHERE member.rolname = ${literal(role)}
      LOOP EXECUTE format('REVOKE %I FROM ${quotedRole}', parent_role.rolname);
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
    if (version < REPORTING_MIN_SERVER_VERSION) {
      throw new Error('Reporting cutover reader requires PostgreSQL 16');
    }
    if (kind === 'source') {
      validateReportingCutoverSourceDatabaseName(databaseName);
    } else {
      validateReportingDatabaseName(databaseName);
    }
    if (
      expectedDatabaseName !== undefined &&
      databaseName !== expectedDatabaseName
    ) {
      throw new Error(
        kind === 'source'
          ? 'Reporting cutover source owner URL must target Core/shared PostgreSQL'
          : 'Reporting owner URL must target an isolated Reporting database',
      );
    }
    const relationCount = await assertReportingSchema(client);
    const database = identifier(databaseName);
    await client.query(`REVOKE ALL ON DATABASE ${database} FROM ${quotedRole}`);
    await client.query(
      `GRANT CONNECT ON DATABASE ${database} TO ${quotedRole}`,
    );
    await client.query(`REVOKE ALL ON SCHEMA public FROM ${quotedRole}`);
    await client.query(`DO $$ DECLARE foreign_schema record; BEGIN
      FOR foreign_schema IN
        SELECT nspname FROM pg_namespace
        WHERE nspname = ANY(ARRAY[${FOREIGN_SCHEMAS.map(literal).join(', ')}])
      LOOP
        EXECUTE format('REVOKE ALL ON SCHEMA %I FROM ${quotedRole}', foreign_schema.nspname);
      END LOOP;
    END $$`);
    await client.query(`REVOKE ALL ON SCHEMA ${schema} FROM ${quotedRole}`);
    await client.query(`GRANT USAGE ON SCHEMA ${schema} TO ${quotedRole}`);
    await client.query(
      `REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM ${quotedRole}`,
    );
    await client.query(
      `REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${schema} FROM ${quotedRole}`,
    );
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema}
      REVOKE ALL ON TABLES FROM ${quotedRole}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema}
      REVOKE ALL ON SEQUENCES FROM ${quotedRole}`);
    for (const grant of REPORTING_CUTOVER_READER_GRANTS) {
      await client.query(
        `GRANT SELECT (${grant.columns.map(identifier).join(', ')}) ON TABLE ${schema}.${identifier(grant.table)} TO ${quotedRole}`,
      );
    }
    await client.query(`ALTER ROLE ${quotedRole} IN DATABASE ${database}
      SET search_path = ${schema}, pg_catalog`);
    await verifyReportingCutoverReaderRole(
      client,
      role,
      databaseName,
      counterpartDatabaseName,
    );
    await client.query('COMMIT');
    return { status: 'PASS', role, relationCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  const kind = parseReportingCutoverReaderKind(process.argv[2]);
  const ownerUrl = process.env[ownerUrlEnvName(kind)];
  const password = process.env[passwordEnvName(kind)];
  const sourceUrl = process.env.REPORTING_CUTOVER_SOURCE_OWNER_URL;
  const targetUrl = process.env.REPORTING_CUTOVER_TARGET_OWNER_URL;
  if (!ownerUrl || !password || !sourceUrl || !targetUrl) {
    throw new Error(
      `${ownerUrlEnvName(kind)}, ${passwordEnvName(kind)} and both cutover owner URLs are required`,
    );
  }
  const classification = classifyReportingCutoverOwnerUrls(
    sourceUrl,
    targetUrl,
  );
  const parsed = parseReportingCutoverOwnerUrl(ownerUrl, kind);
  const counterpartDatabaseName = classification.sharesDatabaseServer
    ? kind === 'source'
      ? classification.targetDatabaseName
      : classification.sourceDatabaseName
    : undefined;
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const report = await provisionReportingCutoverReaderRole(
      client,
      password,
      kind,
      parsed.databaseName,
      counterpartDatabaseName,
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write('Reporting cutover reader role provisioning failed\n');
    process.exitCode = 1;
  });
}
