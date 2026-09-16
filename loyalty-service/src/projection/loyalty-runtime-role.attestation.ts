import type { DataSource } from 'typeorm';

export const LOYALTY_PROJECTION_RUNTIME_ROLE =
  'blujet_loyalty_projection_runtime';

type RuntimeRoleAttestationState = {
  role: string;
  isolatedDatabase: boolean;
  utcSession: boolean;
  boundedSession: boolean;
  safeSearchPath: boolean;
  restrictedRole: boolean;
  noMemberships: boolean;
  noOwnership: boolean;
  databaseAccess: boolean;
  schemaAccess: boolean;
  noDdl: boolean;
  requiredGrants: boolean;
  leastPrivilege: boolean;
  noCrossDomainAccess: boolean;
  noForeignConnect: boolean;
};

const BOOLEAN_CHECKS: ReadonlyArray<
  keyof Omit<RuntimeRoleAttestationState, 'role'>
> = [
  'isolatedDatabase',
  'utcSession',
  'boundedSession',
  'safeSearchPath',
  'restrictedRole',
  'noMemberships',
  'noOwnership',
  'databaseAccess',
  'schemaAccess',
  'noDdl',
  'requiredGrants',
  'leastPrivilege',
  'noCrossDomainAccess',
  'noForeignConnect',
];

export const LOYALTY_RUNTIME_ROLE_ATTESTATION_SQL = `WITH role_state AS (
    SELECT oid, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
      rolreplication, rolbypassrls
    FROM pg_roles WHERE rolname = current_user
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
    VALUES
      ('club_members', 'SELECT'), ('club_members', 'INSERT'),
      ('club_members', 'UPDATE'),
      ('club_points_entries', 'SELECT'), ('club_points_entries', 'INSERT'),
      ('club_points_entries', 'UPDATE'),
      ('club_card_requests', 'SELECT'), ('club_card_requests', 'INSERT'),
      ('club_card_requests', 'UPDATE'),
      ('club_tier_rules', 'SELECT'), ('club_tier_rules', 'INSERT'),
      ('club_tier_rules', 'UPDATE'),
      ('price_locks', 'SELECT'), ('price_locks', 'INSERT'),
      ('price_locks', 'UPDATE'),
      ('customer_referrals', 'SELECT'), ('customer_referrals', 'INSERT'),
      ('customer_referrals', 'UPDATE'),
      ('loyalty_projection_event_receipts', 'SELECT'),
      ('loyalty_projection_event_receipts', 'INSERT'),
      ('loyalty_projection_slots', 'SELECT'),
      ('loyalty_projection_slots', 'INSERT'),
      ('loyalty_projection_slots', 'UPDATE'),
      ('kafka_consumer_checkpoints', 'SELECT'),
      ('kafka_consumer_checkpoints', 'INSERT'),
      ('kafka_consumer_checkpoints', 'UPDATE'),
      ('kafka_processing_failures', 'SELECT'),
      ('kafka_processing_failures', 'INSERT'),
      ('kafka_processing_failures', 'UPDATE')
  ), expected_tables(table_name) AS (
    VALUES ('club_members'), ('club_points_entries'),
      ('club_card_requests'), ('club_tier_rules'), ('price_locks'),
      ('customer_referrals'), ('loyalty_projection_event_receipts'),
      ('loyalty_projection_slots'), ('kafka_consumer_checkpoints'),
      ('kafka_processing_failures')
  )
  SELECT current_user AS role,
    current_database() ~ '^blujet_loyalty(?:_[A-Za-z0-9_]+)?$'
      AS "isolatedDatabase",
    current_setting('TimeZone') = 'UTC' AS "utcSession",
    current_setting('statement_timeout')::interval > interval '0 seconds'
      AND current_setting('statement_timeout')::interval <= interval '5 seconds'
      AND current_setting('lock_timeout')::interval > interval '0 seconds'
      AND current_setting('lock_timeout')::interval <= interval '2 seconds'
      AS "boundedSession",
    current_setting('search_path') = 'loyalty, pg_catalog'
      AS "safeSearchPath",
    EXISTS (SELECT 1 FROM role_state WHERE NOT (
      rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR
      rolreplication OR rolbypassrls
    )) AS "restrictedRole",
    NOT EXISTS (
      SELECT 1 FROM pg_auth_members membership, role_state role
      WHERE membership.member = role.oid
    ) AS "noMemberships",
    NOT EXISTS (SELECT 1 FROM owned) AS "noOwnership",
    has_database_privilege(current_user, current_database(), 'CONNECT')
      AND NOT has_database_privilege(
        current_user, current_database(), 'CREATE,TEMP'
      ) AS "databaseAccess",
    has_schema_privilege(current_user, 'loyalty', 'USAGE')
      AND NOT has_schema_privilege(current_user, 'loyalty', 'CREATE')
      AS "schemaAccess",
    NOT has_database_privilege(
      current_user, current_database(), 'CREATE,TEMP'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_namespace namespace
      WHERE has_schema_privilege(current_user, namespace.oid, 'CREATE')
    ) AS "noDdl",
    NOT EXISTS (
      SELECT 1 FROM allowed
      LEFT JOIN loyalty_relations relation
        ON relation.relname = allowed.table_name
        AND relation.relkind IN ('r', 'p')
      WHERE relation.oid IS NULL OR NOT has_table_privilege(
        current_user, relation.oid, allowed.privilege_type
      )
    ) AS "requiredGrants",
    NOT EXISTS (
      SELECT 1 FROM loyalty_relations relation
      WHERE relation.relkind IN ('r', 'p') AND (
        relation.relname NOT IN (SELECT table_name FROM expected_tables)
          AND has_any_column_privilege(
            current_user, relation.oid, 'SELECT,INSERT,UPDATE'
          )
        OR has_table_privilege(
          current_user, relation.oid, 'DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )
        OR relation.relname = 'loyalty_projection_event_receipts'
          AND has_any_column_privilege(current_user, relation.oid, 'UPDATE')
      ) OR relation.relkind = 'S' AND has_sequence_privilege(
        current_user, relation.oid, 'USAGE,SELECT,UPDATE'
      )
    ) AS "leastPrivilege",
    NOT EXISTS (
      SELECT 1 FROM foreign_relations relation
      WHERE relation.relkind IN ('r', 'p') AND (
        has_any_column_privilege(
          current_user, relation.oid, 'SELECT,INSERT,UPDATE'
        ) OR has_table_privilege(
          current_user, relation.oid, 'DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )
      ) OR relation.relkind = 'S' AND has_sequence_privilege(
        current_user, relation.oid, 'USAGE,SELECT,UPDATE'
      )
    ) AS "noCrossDomainAccess",
    NOT EXISTS (
      SELECT 1 FROM pg_database database
      WHERE database.datallowconn AND NOT database.datistemplate
        AND database.datname <> current_database()
        AND has_database_privilege(current_user, database.oid, 'CONNECT')
    ) AS "noForeignConnect"`;

export async function attestLoyaltyProjectionRuntimeRole(
  dataSource: Pick<DataSource, 'query'>,
): Promise<void> {
  const rows = await dataSource.query<RuntimeRoleAttestationState[]>(
    LOYALTY_RUNTIME_ROLE_ATTESTATION_SQL,
  );
  const state = rows[0];
  if (
    state?.role !== LOYALTY_PROJECTION_RUNTIME_ROLE ||
    BOOLEAN_CHECKS.some((check) => state[check] !== true)
  ) {
    throw new Error('Loyalty projection runtime role attestation failed');
  }
}
