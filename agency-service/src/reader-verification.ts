import { DataSource } from 'typeorm';

// Exact A6.4 projection columns, including tenant predicates.
const READER_COLUMNS = [
  {
    schema: 'agency',
    relation: 'agency_profiles',
    columns: ['userId', 'city', 'tier', 'joinedAt', 'suspendedAt'],
  },
  {
    schema: 'agency',
    relation: 'agency_invoices',
    columns: [
      'id',
      'agencyId',
      'invoiceNo',
      'amountIrr',
      'status',
      'issuedAt',
      'dueAt',
      'paidAt',
    ],
  },
] as const;

export interface ReaderChecks {
  restrictedRole: boolean;
  noMemberships: boolean;
  noOwnership: boolean;
  noCreate: boolean;
  requiredReads: boolean;
  exactReads: boolean;
  noWrites: boolean;
  noSequenceAccess: boolean;
  noDefinerExecute: boolean;
}
export interface ReaderReport {
  status: 'PASS' | 'FAIL';
  checks: ReaderChecks;
}

/** Catalog-only evidence for this database; does not grant or revoke anything. */
export async function verifyReader(db: DataSource): Promise<ReaderReport> {
  const rows = await db.transaction('REPEATABLE READ', async (tx) => {
    await tx.query('SET TRANSACTION READ ONLY');
    return tx.query<ReaderChecks[]>(
      `
      WITH allowed AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb)
          AS a(schema text, relation text, columns text[])
      ), namespaces AS (
        SELECT oid, nspname, nspowner FROM pg_namespace
        WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
      ), relations AS (
        SELECT c.oid, c.relname, c.relowner, c.relkind, n.nspname
        FROM pg_class c JOIN namespaces n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      ), columns AS (
        SELECT r.*, a.attname, a.attnum
        FROM relations r JOIN pg_attribute a ON a.attrelid = r.oid
        WHERE r.relkind <> 'S' AND a.attnum > 0 AND NOT a.attisdropped
      )
      SELECT
        EXISTS (SELECT 1 FROM pg_roles WHERE oid = current_user::regrole
          AND NOT (rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)) AS "restrictedRole",
        NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = current_user::regrole) AS "noMemberships",
        (NOT EXISTS (SELECT 1 FROM relations WHERE relowner = current_user::regrole)
          AND NOT EXISTS (SELECT 1 FROM namespaces WHERE nspowner = current_user::regrole)
          AND NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database()
            AND datdba = current_user::regrole)) AS "noOwnership",
        (NOT has_database_privilege(current_database(), 'CREATE')
          AND NOT EXISTS (SELECT 1 FROM namespaces WHERE has_schema_privilege(oid, 'CREATE'))) AS "noCreate",
        (SELECT bool_and(COALESCE(has_schema_privilege(n.oid, 'USAGE'), false)
            AND COALESCE(has_column_privilege(c.oid, att.attnum, 'SELECT'), false))
          FROM allowed a CROSS JOIN LATERAL unnest(a.columns) AS col
          LEFT JOIN pg_namespace n ON n.nspname = a.schema
          LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = a.relation
          LEFT JOIN pg_attribute att ON att.attrelid = c.oid AND att.attname = col
            AND att.attnum > 0 AND NOT att.attisdropped) AS "requiredReads",
        NOT EXISTS (SELECT 1 FROM columns c
          WHERE has_column_privilege(c.oid, c.attnum, 'SELECT')
            AND NOT EXISTS (SELECT 1 FROM allowed a WHERE a.schema = c.nspname
              AND a.relation = c.relname AND c.attname = ANY(a.columns))) AS "exactReads",
        (NOT EXISTS (SELECT 1 FROM relations WHERE CASE WHEN relkind <> 'S'
            THEN has_table_privilege(oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') ELSE false END)
          AND NOT EXISTS (SELECT 1 FROM columns
            WHERE has_column_privilege(oid, attnum, 'INSERT,UPDATE,REFERENCES'))) AS "noWrites",
        NOT EXISTS (SELECT 1 FROM relations WHERE CASE WHEN relkind = 'S'
          THEN has_sequence_privilege(oid, 'USAGE,SELECT,UPDATE') ELSE false END) AS "noSequenceAccess",
        NOT EXISTS (SELECT 1 FROM pg_proc p JOIN namespaces n ON n.oid = p.pronamespace
          WHERE p.prosecdef AND has_function_privilege(p.oid, 'EXECUTE')) AS "noDefinerExecute"
    `,
      [JSON.stringify(READER_COLUMNS)],
    );
  });
  const checks = rows[0];
  if (
    !checks ||
    Object.values(checks).some((value) => typeof value !== 'boolean')
  ) {
    throw new Error('Reader privilege metadata unavailable');
  }
  return {
    status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
    checks,
  };
}
