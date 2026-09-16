import 'dotenv/config';
import { Client } from 'pg';

export const LOYALTY_CUTOVER_SOURCE_ROLE = 'blujet_loyalty_cutover_source';
export const LOYALTY_CUTOVER_TARGET_ROLE = 'blujet_loyalty_cutover_target';
export const LOYALTY_RUNTIME_ROLE = 'blujet_loyalty_runtime';
export const LOYALTY_MIN_SERVER_VERSION = 160000;
export const LOYALTY_DATABASE_NAME_PATTERN = /^blujet_loyalty(?:$|[_-])/;

export type LoyaltyCutoverReaderKind = 'source' | 'target';

export type LoyaltyCutoverReaderGrant = {
  schema: 'loyalty' | 'orders';
  table: string;
  columns: readonly string[];
};

const BUSINESS_GRANTS: readonly LoyaltyCutoverReaderGrant[] = [
  {
    schema: 'loyalty',
    table: 'club_members',
    columns: [
      'id',
      'userId',
      'fullName',
      'email',
      'birthDate',
      'nationalIdEnc',
      'nationalIdHash',
      'joinDate',
      'points',
      'level',
      'cardStatus',
      'cardNo',
      'issuedByLabelFa',
      'createdAt',
      'deactivatedAt',
      'deactivatedById',
      'version',
    ],
  },
  {
    schema: 'loyalty',
    table: 'club_points_entries',
    columns: [
      'id',
      'clubMemberId',
      'type',
      'signedPoints',
      'bookingId',
      'createdAt',
      'version',
    ],
  },
  {
    schema: 'loyalty',
    table: 'club_card_requests',
    columns: [
      'id',
      'memberId',
      'level',
      'points',
      'status',
      'assignedTo',
      'decidedById',
      'decidedAt',
      'cardNo',
      'history',
      'createdAt',
      'version',
    ],
  },
  {
    schema: 'loyalty',
    table: 'club_tier_rules',
    columns: [
      'id',
      'goldMinPoints',
      'platinumMinPoints',
      'cardRequestMinPoints',
      'updatedById',
      'updatedAt',
      'createdAt',
      'version',
    ],
  },
  {
    schema: 'loyalty',
    table: 'price_locks',
    columns: [
      'id',
      'userId',
      'flightInstanceId',
      'cabin',
      'lockedPriceIrr',
      'feeIrr',
      'feeCharged',
      'status',
      'expiresAt',
      'createdAt',
      'bookingId',
      'version',
    ],
  },
  {
    schema: 'loyalty',
    table: 'customer_referrals',
    columns: [
      'id',
      'referrerUserId',
      'referredUserId',
      'status',
      'pointsAwarded',
      'firstBookingId',
      'rewardedAt',
      'createdAt',
      'updatedAt',
      'version',
    ],
  },
];

export const LOYALTY_CUTOVER_SOURCE_GRANTS: readonly LoyaltyCutoverReaderGrant[] =
  [
    ...BUSINESS_GRANTS,
    {
      schema: 'loyalty',
      table: 'loyalty_projection_audits',
      columns: ['id', 'aggregateType', 'aggregateId', 'recordVersion'],
    },
    {
      schema: 'orders',
      table: 'commerce_outbox_events',
      columns: ['producer', 'deliveredAt', 'deadLetterAt', 'claimedAt'],
    },
  ];

export const LOYALTY_CUTOVER_TARGET_GRANTS: readonly LoyaltyCutoverReaderGrant[] =
  [
    ...BUSINESS_GRANTS,
    {
      schema: 'loyalty',
      table: 'loyalty_projection_event_receipts',
      columns: ['auditId', 'aggregateType', 'aggregateId', 'recordVersion'],
    },
    {
      schema: 'loyalty',
      table: 'loyalty_projection_slots',
      columns: ['aggregateType', 'aggregateId', 'recordVersion'],
    },
    {
      schema: 'loyalty',
      table: 'kafka_processing_failures',
      columns: ['status'],
    },
    {
      schema: 'loyalty',
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

export interface LoyaltyCutoverReaderSqlClient {
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

function roleName(kind: LoyaltyCutoverReaderKind): string {
  return kind === 'source'
    ? LOYALTY_CUTOVER_SOURCE_ROLE
    : LOYALTY_CUTOVER_TARGET_ROLE;
}

function passwordEnvName(kind: LoyaltyCutoverReaderKind): string {
  return kind === 'source'
    ? 'LOYALTY_CUTOVER_SOURCE_PASSWORD'
    : 'LOYALTY_CUTOVER_TARGET_PASSWORD';
}

function ownerUrlEnvName(kind: LoyaltyCutoverReaderKind): string {
  return kind === 'source'
    ? 'LOYALTY_CUTOVER_SOURCE_OWNER_URL'
    : 'LOYALTY_CUTOVER_TARGET_OWNER_URL';
}

function grantsFor(
  kind: LoyaltyCutoverReaderKind,
): readonly LoyaltyCutoverReaderGrant[] {
  return kind === 'source'
    ? LOYALTY_CUTOVER_SOURCE_GRANTS
    : LOYALTY_CUTOVER_TARGET_GRANTS;
}

function allowedSchemas(kind: LoyaltyCutoverReaderKind): readonly string[] {
  return kind === 'source' ? ['loyalty', 'orders'] : ['loyalty'];
}

function databaseIdentity(url: URL): string {
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}${url.pathname}`;
}

function databaseServerIdentity(url: URL): string {
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}`;
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

export function parseLoyaltyCutoverReaderKind(
  value: string | undefined,
): LoyaltyCutoverReaderKind {
  if (value === 'source' || value === 'target') return value;
  throw new Error('Loyalty cutover reader kind is invalid');
}

export function validateLoyaltyCutoverReaderPassword(
  password: string,
  kind: LoyaltyCutoverReaderKind,
): void {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(password)) {
    throw new Error(
      `${passwordEnvName(kind)} must be 32-128 URL-safe characters`,
    );
  }
}

export function validateLoyaltyCutoverSourceDatabaseName(
  databaseName: string,
): void {
  if (LOYALTY_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      'Loyalty cutover source owner URL must target Core/shared PostgreSQL',
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

export function parseLoyaltyCutoverOwnerUrl(
  ownerUrl: string,
  kind: LoyaltyCutoverReaderKind,
): { databaseName: string; username: string; identity: string } {
  const parsed = parsePostgresUrl(ownerUrl, ownerUrlEnvName(kind));
  const username = decodeURIComponent(parsed.username);
  const forbidden = new Set([
    LOYALTY_CUTOVER_SOURCE_ROLE,
    LOYALTY_CUTOVER_TARGET_ROLE,
    LOYALTY_RUNTIME_ROLE,
  ]);
  if (!username || forbidden.has(username)) {
    throw new Error(
      'Loyalty cutover owner must differ from the reader and runtime roles',
    );
  }
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\//, ''),
  ).split('?')[0];
  if (!databaseName || databaseName.includes('/')) {
    throw new Error(`${ownerUrlEnvName(kind)} must be PostgreSQL`);
  }
  if (kind === 'source') {
    validateLoyaltyCutoverSourceDatabaseName(databaseName);
  } else {
    validateLoyaltyDatabaseName(databaseName);
  }
  return { databaseName, username, identity: databaseIdentity(parsed) };
}

export function classifyLoyaltyCutoverOwnerUrls(
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
      'Loyalty cutover reader owner URLs must target distinct databases',
    );
  }
  const source = parseLoyaltyCutoverOwnerUrl(sourceUrl, 'source');
  const target = parseLoyaltyCutoverOwnerUrl(targetUrl, 'target');
  return {
    sourceDatabaseName: source.databaseName,
    targetDatabaseName: target.databaseName,
    sharesDatabaseServer:
      databaseServerIdentity(sourceParsed) ===
      databaseServerIdentity(targetParsed),
  };
}

function expectedColumnsSql(
  grants: readonly LoyaltyCutoverReaderGrant[],
): string {
  return grants
    .flatMap(({ schema, table, columns }) =>
      columns.map(
        (column) =>
          `(${literal(schema)}::text, ${literal(table)}::text, ${literal(column)}::text)`,
      ),
    )
    .join(', ');
}

function expectedTablesSql(
  grants: readonly LoyaltyCutoverReaderGrant[],
): string {
  return grants
    .map(
      ({ schema, table }) =>
        `(${literal(schema)}::text, ${literal(table)}::text)`,
    )
    .join(', ');
}

async function verifyLoyaltyCutoverReaderRole(
  client: LoyaltyCutoverReaderSqlClient,
  role: string,
  kind: LoyaltyCutoverReaderKind,
  databaseName: string,
  counterpartDatabaseName?: string,
): Promise<void> {
  const grants = grantsFor(kind);
  const schemas = allowedSchemas(kind);
  const expectedColumns = expectedColumnsSql(grants);
  const expectedTables = expectedTablesSql(grants);
  const allowedSchemaSql = schemas.map(literal).join(', ');
  const noCounterpartConnectSql = counterpartDatabaseName
    ? `NOT has_database_privilege(
          ${literal(role)}, ${literal(counterpartDatabaseName)}, 'CONNECT'
        )`
    : 'true';
  const result = await client.query(`WITH role_state AS (
      SELECT oid, rolcanlogin, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
        rolreplication, rolbypassrls, coalesce(rolconfig, ARRAY[]::text[]) AS config
      FROM pg_roles WHERE rolname = ${literal(role)}
    ), expected_columns(schema_name, table_name, column_name) AS (
      VALUES ${expectedColumns}
    ), expected_tables(schema_name, table_name) AS (
      VALUES ${expectedTables}
    ), allowed_relations AS (
      SELECT c.oid, n.nspname, c.relname, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN (${allowedSchemaSql}) AND c.relkind IN ('r', 'p', 'S')
    ), allowed_columns AS (
      SELECT c.oid, n.nspname, c.relname, a.attname AS column_name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname IN (${allowedSchemaSql}) AND c.relkind IN ('r', 'p')
        AND a.attnum > 0 AND NOT a.attisdropped
    ), foreign_relations AS (
      SELECT c.oid, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN (
          ${allowedSchemaSql}, 'pg_catalog', 'information_schema'
        ) AND n.nspname NOT LIKE 'pg_toast%'
        AND c.relkind IN ('r', 'p', 'S')
    ), owned AS (
      SELECT 1 FROM pg_class c, role_state r WHERE c.relowner = r.oid
      UNION ALL SELECT 1 FROM pg_namespace n, role_state r
        WHERE n.nspowner = r.oid
      UNION ALL SELECT 1 FROM pg_database d, role_state r WHERE d.datdba = r.oid
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
      NOT EXISTS (SELECT 1 FROM pg_auth_members membership, role_state role
        WHERE membership.member = role.oid) AS "noMemberships",
      NOT EXISTS (SELECT 1 FROM owned) AS "noOwnership",
      has_database_privilege(${literal(role)}, ${literal(databaseName)}, 'CONNECT')
        AND NOT has_database_privilege(
          ${literal(role)}, ${literal(databaseName)}, 'CREATE,TEMP'
        ) AS "databaseAccess",
      NOT EXISTS (SELECT 1 FROM pg_namespace namespace
        WHERE namespace.nspname IN (${allowedSchemaSql}) AND (
          NOT has_schema_privilege(${literal(role)}, namespace.oid, 'USAGE') OR
          has_schema_privilege(${literal(role)}, namespace.oid, 'CREATE')
        )) AS "schemaAccess",
      NOT EXISTS (SELECT 1 FROM pg_namespace namespace
        WHERE namespace.nspname NOT IN (
          ${allowedSchemaSql}, 'pg_catalog', 'information_schema'
        ) AND namespace.nspname NOT LIKE 'pg_toast%'
          AND has_schema_privilege(
            ${literal(role)}, namespace.oid, 'USAGE,CREATE'
          )) AS "noForeignSchemaAccess",
      NOT EXISTS (SELECT 1 FROM allowed_relations relation
        LEFT JOIN expected_tables expected
          ON expected.schema_name = relation.nspname
         AND expected.table_name = relation.relname
        WHERE relation.relkind IN ('r', 'p') AND
          has_any_column_privilege(
            ${literal(role)}, relation.oid, 'SELECT'
          ) != (expected.table_name IS NOT NULL)) AS "exactReads",
      NOT EXISTS (SELECT 1 FROM allowed_columns column_row
        LEFT JOIN expected_columns expected
          ON expected.schema_name = column_row.nspname
         AND expected.table_name = column_row.relname
         AND expected.column_name = column_row.column_name
        WHERE has_column_privilege(
          ${literal(role)}, column_row.oid, column_row.column_name, 'SELECT'
        ) != (expected.column_name IS NOT NULL)) AS "exactColumns",
      NOT EXISTS (SELECT 1 FROM allowed_relations relation WHERE
        (relation.relkind IN ('r', 'p') AND has_table_privilege(
          ${literal(role)}, relation.oid,
          'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )) OR (relation.relkind = 'S' AND has_sequence_privilege(
          ${literal(role)}, relation.oid, 'USAGE,SELECT,UPDATE'
        ))) AS "noWrites",
      NOT has_database_privilege(${literal(role)}, current_database(), 'CREATE')
        AND NOT has_database_privilege(${literal(role)}, current_database(), 'TEMP')
        AND NOT EXISTS (SELECT 1 FROM pg_namespace n
          WHERE has_schema_privilege(${literal(role)}, n.oid, 'CREATE'))
        AS "noDdl",
      NOT EXISTS (SELECT 1 FROM foreign_relations relation WHERE
        (relation.relkind IN ('r', 'p') AND (
          has_any_column_privilege(
            ${literal(role)}, relation.oid, 'SELECT,INSERT,UPDATE'
          ) OR has_table_privilege(
            ${literal(role)}, relation.oid, 'DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
        )) OR (relation.relkind = 'S' AND has_sequence_privilege(
          ${literal(role)}, relation.oid, 'USAGE,SELECT,UPDATE'
        ))) AS "noCrossDomainAccess",
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
    'noWrites',
    'noDdl',
    'noCrossDomainAccess',
    'noCounterpartConnect',
  ].filter((key) => checks?.[key] !== true);
  if (failed.length > 0) {
    throw new Error(
      `Loyalty cutover reader role verification failed (${failed.join(',')})`,
    );
  }
}

export async function provisionLoyaltyCutoverReaderRole(
  client: LoyaltyCutoverReaderSqlClient,
  password: string,
  kind: LoyaltyCutoverReaderKind,
  expectedDatabaseName?: string,
  counterpartDatabaseName?: string,
): Promise<{ status: 'PASS'; role: string; relationCount: number }> {
  validateLoyaltyCutoverReaderPassword(password, kind);
  const role = roleName(kind);
  const quotedRole = identifier(role);
  const grants = grantsFor(kind);
  const schemas = allowedSchemas(kind);
  await client.query('BEGIN');
  try {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(role)})
      THEN CREATE ROLE ${quotedRole} LOGIN; END IF;
    END $$`);
    const passwordSql = await client.query(
      `SELECT format('ALTER ROLE ${quotedRole} PASSWORD %L', $1::text) AS statement`,
      [password],
    );
    const statement = passwordSql.rows[0]?.statement;
    if (typeof statement !== 'string') {
      throw new Error(
        'PostgreSQL could not prepare the Loyalty cutover reader credential',
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
    if (version < LOYALTY_MIN_SERVER_VERSION) {
      throw new Error('Loyalty cutover reader requires PostgreSQL 16');
    }
    if (kind === 'source') {
      validateLoyaltyCutoverSourceDatabaseName(databaseName);
    } else {
      validateLoyaltyDatabaseName(databaseName);
    }
    if (
      expectedDatabaseName !== undefined &&
      databaseName !== expectedDatabaseName
    ) {
      throw new Error(
        kind === 'source'
          ? 'Loyalty cutover source owner URL must target Core/shared PostgreSQL'
          : 'Loyalty owner URL must target an isolated Loyalty database',
      );
    }

    const database = identifier(databaseName);
    await client.query(`REVOKE ALL ON DATABASE ${database} FROM ${quotedRole}`);
    await client.query(
      `GRANT CONNECT ON DATABASE ${database} TO ${quotedRole}`,
    );
    await client.query(`DO $$ DECLARE foreign_schema record; BEGIN
      FOR foreign_schema IN SELECT nspname FROM pg_namespace
        WHERE nspname NOT IN (
          ${schemas.map(literal).join(', ')}, 'pg_catalog', 'information_schema'
        ) AND nspname NOT LIKE 'pg_toast%'
      LOOP
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM ${quotedRole}', foreign_schema.nspname);
        EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM ${quotedRole}', foreign_schema.nspname);
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
    for (const grant of grants) {
      await client.query(
        `GRANT SELECT (${grant.columns.map(identifier).join(', ')}) ON TABLE ${identifier(grant.schema)}.${identifier(grant.table)} TO ${quotedRole}`,
      );
    }
    await client.query(`ALTER ROLE ${quotedRole} IN DATABASE ${database}
      SET search_path = ${schemas.map(identifier).join(', ')}, pg_catalog`);
    await verifyLoyaltyCutoverReaderRole(
      client,
      role,
      kind,
      databaseName,
      counterpartDatabaseName,
    );
    await client.query('COMMIT');
    return {
      status: 'PASS',
      role,
      relationCount: new Set(
        grants.map(({ schema, table }) => `${schema}.${table}`),
      ).size,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  const kind = parseLoyaltyCutoverReaderKind(process.argv[2]);
  const ownerUrl = process.env[ownerUrlEnvName(kind)];
  const password = process.env[passwordEnvName(kind)];
  const sourceUrl = process.env.LOYALTY_CUTOVER_SOURCE_OWNER_URL;
  const targetUrl = process.env.LOYALTY_CUTOVER_TARGET_OWNER_URL;
  if (!ownerUrl || !password || !sourceUrl || !targetUrl) {
    throw new Error(
      `${ownerUrlEnvName(kind)}, ${passwordEnvName(kind)} and both cutover owner URLs are required`,
    );
  }
  const classification = classifyLoyaltyCutoverOwnerUrls(sourceUrl, targetUrl);
  const parsed = parseLoyaltyCutoverOwnerUrl(ownerUrl, kind);
  const counterpartDatabaseName = classification.sharesDatabaseServer
    ? kind === 'source'
      ? classification.targetDatabaseName
      : classification.sourceDatabaseName
    : undefined;
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const report = await provisionLoyaltyCutoverReaderRole(
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
    process.stderr.write('Loyalty cutover reader role provisioning failed\n');
    process.exitCode = 1;
  });
}
