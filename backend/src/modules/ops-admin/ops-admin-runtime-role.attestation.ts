import type { DataSource } from 'typeorm';

export const OPS_ADMIN_PROJECTION_RUNTIME_ROLE =
  'blujet_ops_admin_projection_runtime';

type OpsAdminRuntimeRoleAttestationState = {
  role: string;
  sessionRole: string;
  isolatedDatabase: boolean;
  safeSearchPath: boolean;
  loginRole: boolean;
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
  keyof Omit<OpsAdminRuntimeRoleAttestationState, 'role' | 'sessionRole'>
> = [
  'isolatedDatabase',
  'safeSearchPath',
  'loginRole',
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

export const OPS_ADMIN_RUNTIME_ROLE_ATTESTATION_SQL = `WITH role_state AS (
    SELECT oid, rolcanlogin, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
      rolreplication, rolbypassrls
    FROM pg_roles WHERE rolname = current_user
  ), ops_relations AS (
    SELECT c.oid, c.relname, c.relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'ops' AND c.relkind IN ('r', 'p', 'S')
  ), foreign_relations AS (
    SELECT c.oid, c.relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('ops', 'pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_%'
      AND c.relkind IN ('r', 'p', 'S')
  ), foreign_schemas AS (
    SELECT n.oid
    FROM pg_namespace n
    WHERE n.nspname NOT IN ('ops', 'pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_%'
  ), owned AS (
    SELECT 1 FROM pg_class c, role_state r WHERE c.relowner = r.oid
    UNION ALL
    SELECT 1 FROM pg_namespace n, role_state r WHERE n.nspowner = r.oid
    UNION ALL
    SELECT 1 FROM pg_database d, role_state r WHERE d.datdba = r.oid
  ), allowed(table_name, privilege_type) AS (
    VALUES
      ('cartable_tasks', 'SELECT'), ('cartable_tasks', 'INSERT'),
      ('cartable_tasks', 'UPDATE'),
      ('cartable_projection_event_receipts', 'SELECT'),
      ('cartable_projection_event_receipts', 'INSERT'),
      ('kafka_consumer_checkpoints', 'SELECT'),
      ('kafka_consumer_checkpoints', 'INSERT'),
      ('kafka_consumer_checkpoints', 'UPDATE'),
      ('kafka_processing_failures', 'SELECT'),
      ('kafka_processing_failures', 'INSERT'),
      ('kafka_processing_failures', 'UPDATE')
  ), expected_tables(table_name) AS (
    VALUES ('cartable_tasks'), ('cartable_projection_event_receipts'),
      ('kafka_consumer_checkpoints'), ('kafka_processing_failures')
  )
  SELECT current_user AS role, session_user AS "sessionRole",
    current_database() ~ '^blujet_ops_admin(?:_[A-Za-z0-9_]+)?$'
      AS "isolatedDatabase",
    current_setting('search_path') = 'ops, pg_catalog'
      AS "safeSearchPath",
    EXISTS (SELECT 1 FROM role_state WHERE rolcanlogin) AS "loginRole",
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
      AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
      AND NOT has_database_privilege(current_user, current_database(), 'TEMP')
      AS "databaseAccess",
    has_schema_privilege(current_user, 'ops', 'USAGE')
      AND NOT has_schema_privilege(current_user, 'ops', 'CREATE')
      AS "schemaAccess",
    NOT has_database_privilege(current_user, current_database(), 'CREATE')
      AND NOT has_database_privilege(current_user, current_database(), 'TEMP')
      AND NOT EXISTS (
        SELECT 1 FROM pg_namespace namespace
        WHERE has_schema_privilege(current_user, namespace.oid, 'CREATE')
      ) AS "noDdl",
    NOT EXISTS (
      SELECT 1 FROM allowed
      LEFT JOIN ops_relations relation
        ON relation.relname = allowed.table_name
        AND relation.relkind IN ('r', 'p')
      WHERE relation.oid IS NULL OR NOT has_table_privilege(
        current_user, relation.oid, allowed.privilege_type
      )
    ) AS "requiredGrants",
    NOT EXISTS (
      SELECT 1 FROM ops_relations relation
      WHERE relation.relkind IN ('r', 'p') AND (
        relation.relname NOT IN (SELECT table_name FROM expected_tables)
          AND has_any_column_privilege(
            current_user, relation.oid, 'SELECT,INSERT,UPDATE'
          )
        OR has_table_privilege(
          current_user, relation.oid, 'DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )
        OR relation.relname = 'cartable_projection_event_receipts'
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
    ) AND NOT EXISTS (
      SELECT 1 FROM foreign_schemas schema
      WHERE has_schema_privilege(current_user, schema.oid, 'USAGE,CREATE')
    ) AS "noCrossDomainAccess",
    NOT EXISTS (
      SELECT 1 FROM pg_database database
      WHERE database.datallowconn AND NOT database.datistemplate
        AND database.datname <> current_database()
        AND has_database_privilege(current_user, database.oid, 'CONNECT')
    ) AS "noForeignConnect"`;

export async function attestOpsAdminProjectionRuntimeRole(
  dataSource: Pick<DataSource, 'query'>,
): Promise<void> {
  const rows = await dataSource.query<OpsAdminRuntimeRoleAttestationState[]>(
    OPS_ADMIN_RUNTIME_ROLE_ATTESTATION_SQL,
  );
  const state = rows[0];
  if (
    state?.role !== OPS_ADMIN_PROJECTION_RUNTIME_ROLE ||
    state.sessionRole !== OPS_ADMIN_PROJECTION_RUNTIME_ROLE ||
    BOOLEAN_CHECKS.some((check) => state[check] !== true)
  ) {
    throw new Error('Ops/Admin projection runtime role attestation failed');
  }
}
