import 'dotenv/config';
import { Client } from 'pg';

export const AGENCY_CUTOVER_SOURCE_ROLE = 'blujet_agency_cutover_source';
export const AGENCY_CUTOVER_TARGET_ROLE = 'blujet_agency_cutover_target';
export const AGENCY_RUNTIME_ROLE = 'blujet_agency_runtime';
export const AGENCY_CUTOVER_MIN_SERVER_VERSION = 160000;
export const AGENCY_DATABASE_NAME_PATTERN =
  /^blujet_agency(?:_[A-Za-z0-9_]+)?$/;

export type AgencyCutoverReaderKind = 'source' | 'target';

export interface AgencyCutoverReaderGrant {
  schema: 'agency' | 'orders';
  table: string;
  columns: readonly string[];
}

const BUSINESS_TABLE_COLUMNS = {
  agency_profiles: [
    'userId',
    'version',
    'licenseNo',
    'managerName',
    'phone',
    'email',
    'city',
    'address',
    'tier',
    'suspendedAt',
    'suspendReason',
    'joinedAt',
  ],
  agency_invoices: [
    'id',
    'version',
    'agencyId',
    'bookingId',
    'invoiceNo',
    'issuedById',
    'issuedAt',
    'dueAt',
    'amountIrr',
    'descriptionFa',
    'status',
    'paidAt',
  ],
  agency_credit_requests: [
    'id',
    'version',
    'agencyId',
    'requestedLimitIrr',
    'note',
    'status',
    'decidedById',
    'decidedAt',
    'createdAt',
  ],
} as const;

export const AGENCY_CUTOVER_SOURCE_GRANTS: readonly AgencyCutoverReaderGrant[] =
  [
    {
      schema: 'agency',
      table: 'agency_profiles',
      columns: BUSINESS_TABLE_COLUMNS.agency_profiles,
    },
    {
      schema: 'agency',
      table: 'agency_invoices',
      columns: BUSINESS_TABLE_COLUMNS.agency_invoices,
    },
    {
      schema: 'agency',
      table: 'agency_credit_requests',
      columns: BUSINESS_TABLE_COLUMNS.agency_credit_requests,
    },
    {
      schema: 'agency',
      table: 'agency_projection_audits',
      columns: ['id', 'aggregateType', 'aggregateId', 'recordVersion'],
    },
    {
      schema: 'orders',
      table: 'commerce_outbox_events',
      columns: ['producer', 'deliveredAt', 'deadLetterAt', 'claimedAt'],
    },
  ];

export const AGENCY_CUTOVER_TARGET_GRANTS: readonly AgencyCutoverReaderGrant[] =
  [
    {
      schema: 'agency',
      table: 'agency_profiles',
      columns: BUSINESS_TABLE_COLUMNS.agency_profiles,
    },
    {
      schema: 'agency',
      table: 'agency_invoices',
      columns: BUSINESS_TABLE_COLUMNS.agency_invoices,
    },
    {
      schema: 'agency',
      table: 'agency_credit_requests',
      columns: BUSINESS_TABLE_COLUMNS.agency_credit_requests,
    },
    {
      schema: 'agency',
      table: 'agency_projection_event_receipts',
      columns: [
        'eventId',
        'semanticFingerprint',
        'aggregateType',
        'aggregateId',
        'recordVersion',
        'auditId',
      ],
    },
    {
      schema: 'agency',
      table: 'agency_projection_slots',
      columns: [
        'aggregateType',
        'aggregateId',
        'recordVersion',
        'semanticFingerprint',
      ],
    },
    {
      schema: 'agency',
      table: 'kafka_processing_failures',
      columns: ['status'],
    },
    {
      schema: 'agency',
      table: 'kafka_consumer_checkpoints',
      columns: [
        'consumerGroup',
        'topic',
        'partition',
        'nextOffset',
        'highWatermark',
      ],
    },
  ];

export const AGENCY_CUTOVER_DENIED_COLUMNS = [
  'envelopeFingerprint',
  'receivedAt',
  'mutation',
] as const;

const FOREIGN_SCHEMAS = [
  'public',
  'identity',
  'inventory',
  'orders',
  'payments',
  'loyalty',
  'reporting',
  'notify',
  'experience',
  'audit',
  'ops',
] as const;

export interface AgencyCutoverReaderSqlClient {
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

function grantsFor(
  kind: AgencyCutoverReaderKind,
): readonly AgencyCutoverReaderGrant[] {
  return kind === 'source'
    ? AGENCY_CUTOVER_SOURCE_GRANTS
    : AGENCY_CUTOVER_TARGET_GRANTS;
}

function roleName(kind: AgencyCutoverReaderKind): string {
  return kind === 'source'
    ? AGENCY_CUTOVER_SOURCE_ROLE
    : AGENCY_CUTOVER_TARGET_ROLE;
}

function passwordEnvName(kind: AgencyCutoverReaderKind): string {
  return kind === 'source'
    ? 'AGENCY_CUTOVER_SOURCE_PASSWORD'
    : 'AGENCY_CUTOVER_TARGET_PASSWORD';
}

function ownerUrlEnvName(kind: AgencyCutoverReaderKind): string {
  return kind === 'source'
    ? 'AGENCY_CUTOVER_SOURCE_OWNER_URL'
    : 'AGENCY_CUTOVER_TARGET_OWNER_URL';
}

function allowedSchemas(kind: AgencyCutoverReaderKind): readonly string[] {
  return kind === 'source' ? ['agency', 'orders'] : ['agency'];
}

function databaseIdentity(url: URL): string {
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}${url.pathname}`;
}

function databaseServerIdentity(url: URL): string {
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}`;
}

export function parseAgencyCutoverReaderKind(
  value: string | undefined,
): AgencyCutoverReaderKind {
  if (value === 'source' || value === 'target') return value;
  throw new Error('Agency cutover reader kind is invalid');
}

export function validateAgencyCutoverReaderPassword(
  password: string,
  kind: AgencyCutoverReaderKind,
): void {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(password)) {
    throw new Error(
      `${passwordEnvName(kind)} must be 32-128 URL-safe characters`,
    );
  }
}

export function validateAgencyCutoverSourceDatabaseName(
  databaseName: string,
): void {
  if (AGENCY_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      'Agency cutover source owner URL must target Core/shared PostgreSQL',
    );
  }
}

export function validateAgencyCutoverTargetDatabaseName(
  databaseName: string,
): void {
  if (!AGENCY_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error('Agency owner URL must target an isolated Agency database');
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

export function parseAgencyCutoverOwnerUrl(
  ownerUrl: string,
  kind: AgencyCutoverReaderKind,
): { databaseName: string; username: string; identity: string } {
  const parsed = parsePostgresUrl(ownerUrl, ownerUrlEnvName(kind));
  const username = decodeURIComponent(parsed.username);
  const forbidden = new Set([
    AGENCY_CUTOVER_SOURCE_ROLE,
    AGENCY_CUTOVER_TARGET_ROLE,
    AGENCY_RUNTIME_ROLE,
  ]);
  if (!username || forbidden.has(username)) {
    throw new Error(
      'Agency cutover owner must differ from the reader and runtime roles',
    );
  }
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\//, ''),
  ).split('?')[0];
  if (!databaseName || databaseName.includes('/')) {
    throw new Error(`${ownerUrlEnvName(kind)} must be PostgreSQL`);
  }
  if (kind === 'source') {
    validateAgencyCutoverSourceDatabaseName(databaseName);
  } else {
    validateAgencyCutoverTargetDatabaseName(databaseName);
  }
  return {
    databaseName,
    username,
    identity: databaseIdentity(parsed),
  };
}

export function classifyAgencyCutoverOwnerUrls(
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
      'Agency cutover reader owner URLs must target distinct databases',
    );
  }
  const source = parseAgencyCutoverOwnerUrl(sourceUrl, 'source');
  const target = parseAgencyCutoverOwnerUrl(targetUrl, 'target');
  return {
    sourceDatabaseName: source.databaseName,
    targetDatabaseName: target.databaseName,
    sharesDatabaseServer:
      databaseServerIdentity(sourceParsed) ===
      databaseServerIdentity(targetParsed),
  };
}

function expectedColumnsSql(kind: AgencyCutoverReaderKind): string {
  return grantsFor(kind)
    .flatMap(({ schema, table, columns }) =>
      columns.map(
        (column) =>
          `(${literal(schema)}::text, ${literal(table)}::text, ${literal(column)}::text)`,
      ),
    )
    .join(', ');
}

function expectedTablesSql(kind: AgencyCutoverReaderKind): string {
  return grantsFor(kind)
    .map(
      ({ schema, table }) =>
        `(${literal(schema)}::text, ${literal(table)}::text)`,
    )
    .join(', ');
}

async function assertExpectedRelations(
  client: AgencyCutoverReaderSqlClient,
  kind: AgencyCutoverReaderKind,
): Promise<number> {
  const grants = grantsFor(kind);
  for (const grant of grants) {
    const result = await client.query(
      `SELECT 1 AS present
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = ${literal(grant.schema)}
         AND c.relname = ${literal(grant.table)}
         AND c.relkind IN ('r', 'p')`,
    );
    if (result.rows.length !== 1) {
      throw new Error('Agency cutover reader relation contract does not match');
    }
  }
  return grants.length;
}

async function verifyAgencyCutoverReaderRole(
  client: AgencyCutoverReaderSqlClient,
  role: string,
  kind: AgencyCutoverReaderKind,
  databaseName: string,
  counterpartDatabaseName?: string,
): Promise<void> {
  const expectedTables = expectedTablesSql(kind);
  const expectedColumns = expectedColumnsSql(kind);
  const schemas = allowedSchemas(kind);
  const schemaList = schemas.map(literal).join(', ');
  const noCounterpartConnectSql = counterpartDatabaseName
    ? `NOT has_database_privilege(
          ${literal(role)}, ${literal(counterpartDatabaseName)}, 'CONNECT'
        )`
    : 'true';
  const ordersAccessSql =
    kind === 'source'
      ? `EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = 'orders')
        AND has_schema_privilege(${literal(role)}, 'orders', 'USAGE')
        AND NOT has_schema_privilege(${literal(role)}, 'orders', 'CREATE')`
      : `NOT EXISTS (
          SELECT 1 FROM pg_namespace n
          WHERE n.nspname = 'orders'
            AND has_schema_privilege(${literal(role)}, n.oid, 'USAGE,CREATE')
        )`;
  const result = await client.query(`WITH role_state AS (
      SELECT oid, rolcanlogin, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
        rolreplication, rolbypassrls, coalesce(rolconfig, ARRAY[]::text[]) AS config
      FROM pg_roles WHERE rolname = ${literal(role)}
    ), scoped_relations AS (
      SELECT c.oid, n.nspname, c.relname, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN (${schemaList}) AND c.relkind IN ('r', 'p', 'S')
    ), scoped_columns AS (
      SELECT c.oid, n.nspname, c.relname, a.attname AS column_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname IN (${schemaList}) AND c.relkind IN ('r', 'p')
        AND a.attnum > 0 AND NOT a.attisdropped
    ), expected(schema_name, table_name, column_name) AS (
      VALUES ${expectedColumns}
    ), expected_tables(schema_name, table_name) AS (
      VALUES ${expectedTables}
    ), foreign_relations AS (
      SELECT c.oid, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN (${schemaList}, 'pg_catalog', 'information_schema')
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
      has_schema_privilege(${literal(role)}, 'agency', 'USAGE')
        AND NOT has_schema_privilege(${literal(role)}, 'agency', 'CREATE')
        AND (${ordersAccessSql}) AS "schemaAccess",
      NOT EXISTS (
        SELECT 1 FROM pg_namespace namespace
        WHERE namespace.nspname NOT IN (
          ${schemaList}, 'pg_catalog', 'information_schema'
        )
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND has_schema_privilege(
            ${literal(role)}, namespace.oid, 'USAGE,CREATE'
          )
      ) AS "noForeignSchemaAccess",
      NOT EXISTS (
        SELECT 1 FROM scoped_relations relation
        WHERE relation.relkind IN ('r', 'p')
          AND has_any_column_privilege(
            ${literal(role)}, relation.oid, 'SELECT'
          ) != EXISTS (
            SELECT 1 FROM expected_tables
            WHERE expected_tables.schema_name = relation.nspname
              AND expected_tables.table_name = relation.relname
          )
      ) AS "exactReads",
      NOT EXISTS (
        SELECT 1 FROM scoped_columns column_row
        LEFT JOIN expected
          ON expected.schema_name = column_row.nspname
         AND expected.table_name = column_row.relname
         AND expected.column_name = column_row.column_name
        WHERE has_column_privilege(
          ${literal(role)}, column_row.oid, column_row.column_name, 'SELECT'
        ) != (expected.column_name IS NOT NULL)
      ) AS "exactColumns",
      NOT EXISTS (
        SELECT 1 FROM scoped_columns column_row
        WHERE column_row.column_name = ANY(ARRAY[${AGENCY_CUTOVER_DENIED_COLUMNS.map(literal).join(', ')}])
          AND has_column_privilege(
            ${literal(role)}, column_row.oid, column_row.column_name, 'SELECT'
          )
      ) AS "noDeniedColumns",
      NOT EXISTS (
        SELECT 1 FROM scoped_relations relation
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
    'noDeniedColumns',
    'noWrites',
    'noDdl',
    'noCrossDomainAccess',
    'noCounterpartConnect',
  ].filter((key) => checks?.[key] !== true);
  if (failed.length > 0) {
    throw new Error(
      `Agency cutover reader role verification failed (${failed.join(',')})`,
    );
  }
}

export async function provisionAgencyCutoverReaderRole(
  client: AgencyCutoverReaderSqlClient,
  password: string,
  kind: AgencyCutoverReaderKind,
  expectedDatabaseName?: string,
  counterpartDatabaseName?: string,
): Promise<{ status: 'PASS'; role: string; relationCount: number }> {
  validateAgencyCutoverReaderPassword(password, kind);
  const role = roleName(kind);
  const quotedRole = identifier(role);
  const schemas = allowedSchemas(kind);
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
        'PostgreSQL could not prepare the Agency cutover reader credential',
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
    if (version < AGENCY_CUTOVER_MIN_SERVER_VERSION) {
      throw new Error('Agency cutover reader requires PostgreSQL 16');
    }
    if (kind === 'source') {
      validateAgencyCutoverSourceDatabaseName(databaseName);
    } else {
      validateAgencyCutoverTargetDatabaseName(databaseName);
    }
    if (
      expectedDatabaseName !== undefined &&
      databaseName !== expectedDatabaseName
    ) {
      throw new Error(
        kind === 'source'
          ? 'Agency cutover source owner URL must target Core/shared PostgreSQL'
          : 'Agency owner URL must target an isolated Agency database',
      );
    }
    const relationCount = await assertExpectedRelations(client, kind);
    const database = identifier(databaseName);
    await client.query(`REVOKE ALL ON DATABASE ${database} FROM ${quotedRole}`);
    await client.query(
      `GRANT CONNECT ON DATABASE ${database} TO ${quotedRole}`,
    );
    await client.query(`DO $$ DECLARE foreign_schema record; BEGIN
      FOR foreign_schema IN
        SELECT nspname FROM pg_namespace
        WHERE nspname = ANY(ARRAY[${FOREIGN_SCHEMAS.map(literal).join(', ')}])
           OR nspname = 'agency'
      LOOP
        EXECUTE format('REVOKE ALL ON SCHEMA %I FROM ${quotedRole}', foreign_schema.nspname);
      END LOOP;
    END $$`);
    for (const schemaName of schemas) {
      const schema = identifier(schemaName);
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
    }
    for (const grant of grantsFor(kind)) {
      await client.query(
        `GRANT SELECT (${grant.columns.map(identifier).join(', ')}) ON TABLE ${identifier(grant.schema)}.${identifier(grant.table)} TO ${quotedRole}`,
      );
    }
    const searchPath =
      kind === 'source'
        ? '"agency", "orders", pg_catalog'
        : '"agency", pg_catalog';
    await client.query(`ALTER ROLE ${quotedRole} IN DATABASE ${database}
      SET search_path = ${searchPath}`);
    await verifyAgencyCutoverReaderRole(
      client,
      role,
      kind,
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
  const kind = parseAgencyCutoverReaderKind(process.argv[2]);
  const ownerUrl = process.env[ownerUrlEnvName(kind)];
  const password = process.env[passwordEnvName(kind)];
  const sourceUrl = process.env.AGENCY_CUTOVER_SOURCE_OWNER_URL;
  const targetUrl = process.env.AGENCY_CUTOVER_TARGET_OWNER_URL;
  if (!ownerUrl || !password || !sourceUrl || !targetUrl) {
    throw new Error(
      `${ownerUrlEnvName(kind)}, ${passwordEnvName(kind)} and both cutover owner URLs are required`,
    );
  }
  const classification = classifyAgencyCutoverOwnerUrls(sourceUrl, targetUrl);
  const parsed = parseAgencyCutoverOwnerUrl(ownerUrl, kind);
  const counterpartDatabaseName = classification.sharesDatabaseServer
    ? kind === 'source'
      ? classification.targetDatabaseName
      : classification.sourceDatabaseName
    : undefined;
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const report = await provisionAgencyCutoverReaderRole(
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
    process.stderr.write('Agency cutover reader role provisioning failed\n');
    process.exitCode = 1;
  });
}
