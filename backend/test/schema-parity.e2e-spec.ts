import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';

/**
 * Boots a standalone TypeORM DataSource against the e2e Postgres database
 * (created by `InitialSchema`, the baseline migration under
 * `src/database/migrations/`) and asserts the schema builder has nothing
 * left to do beyond a documented allowlist of known-benign patterns — i.e.
 * all registered entities describe the existing domain tables byte-for-byte (or
 * provably-equivalent-but-textually-different). This is the same check
 * `typeorm migration:generate` runs internally, and guards against the
 * entities and the migration drifting apart over time.
 *
 * Any upQuery NOT matching the allowlist below means an entity's column
 * type/nullability/default/index/relation genuinely doesn't match the
 * live schema and must be fixed — see
 * docs/features/typeorm-migration-phase-0.md for the investigation
 * behind every pattern here.
 */

/** Every entry verified empirically against `pg_attrdef`/`information_schema`
 * (not guessed) before being allowlisted — see the doc above for the
 * investigation behind each one. */
const KNOWN_BENIGN_DIFF_PATTERNS: RegExp[] = [
  // TypeORM's own PostgresDriver.normalizeDatetimeFunction() always
  // rewrites a precision-less `CURRENT_TIMESTAMP` entity default to
  // "now()", but its schema-introspection path does NOT reciprocally
  // normalize a live "CURRENT_TIMESTAMP" default before comparing —
  // confirmed via `SELECT pg_get_expr(...)` on pg_attrdef directly: the
  // DB's actual default expression is `CURRENT_TIMESTAMP`, functionally
  // identical to `now()` on a `timestamp without time zone` column.
  /ALTER COLUMN "\w+" SET DEFAULT now\(\)$/,
  // Same class of issue for empty-array-default columns (the one
  // enum-array column plus the plain text-array seat-map/job-posting
  // columns): entity `default: []` normalizes to the literal '{}' array
  // syntax, while Prisma's migrations wrote `ARRAY[]::"Type"[]` — both
  // are the same empty array, just different valid Postgres literal
  // spellings.
  /ALTER COLUMN "\w+" SET DEFAULT '\{\}'$/,
  // `site_content_blocks.key` is both a public enum and the primary key.
  // TypeORM's enum-relocation proposal consequently churns the unchanged PK.
  /ALTER TABLE "experience"\."site_content_blocks" DROP CONSTRAINT "site_content_blocks_pkey"$/,
  /ALTER TABLE "experience"\."site_content_blocks" ADD CONSTRAINT "site_content_blocks_pkey" PRIMARY KEY \("key"\)$/,
];

type EnumCatalogRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
  udt_schema: string;
  udt_name: string;
  enum_values: string[];
};

describe('TypeORM schema parity', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource(dataSourceOptions);
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('produces only the documented allowlisted diff against the existing Prisma-migrated schema', async () => {
    const enumColumns = dataSource.entityMetadatas.flatMap((metadata) =>
      metadata.columns
        .filter((column) => column.type === 'enum' && column.enumName)
        .map((column) => ({
          tableSchema: metadata.schema ?? 'public',
          tableName: metadata.tableName,
          columnName: column.databaseName,
          enumName: column.enumName as string,
          values: (column.enum ?? []).map(String),
        })),
    );
    const enumColumnKeys = new Set(
      enumColumns.map(
        ({ tableSchema, tableName, columnName }) =>
          `${tableSchema}.${tableName}.${columnName}`,
      ),
    );
    const generatedEnumTypeKeys = new Set(
      enumColumns.map(
        ({ tableSchema, enumName }) => `${tableSchema}.${enumName}`,
      ),
    );

    // TypeORM assumes a PostgreSQL enum lives beside its table and otherwise
    // proposes destructive column churn. Phase 5 intentionally keeps the
    // established enum catalogue in public for expand/contract compatibility,
    // so validate that catalogue directly instead of allowlisting it blindly.
    const enumCatalog = await dataSource.query<EnumCatalogRow[]>(`
      SELECT c.table_schema,
             c.table_name,
             c.column_name,
             c.udt_schema,
             t.typname AS udt_name,
             ARRAY_AGG(e.enumlabel::text ORDER BY e.enumsortorder)::text[] AS enum_values
      FROM information_schema.columns c
      JOIN pg_type t ON t.typname = CASE
        WHEN c.data_type = 'ARRAY' THEN LTRIM(c.udt_name, '_')
        ELSE c.udt_name
      END
      JOIN pg_namespace n ON n.oid = t.typnamespace
                         AND n.nspname = c.udt_schema
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE c.table_schema <> 'public'
      GROUP BY c.table_schema, c.table_name, c.column_name,
               c.udt_schema, t.typname
    `);
    const enumCatalogByColumn = new Map(
      enumCatalog.map((row) => [
        `${row.table_schema}.${row.table_name}.${row.column_name}`,
        row,
      ]),
    );

    for (const expected of enumColumns) {
      const actual = enumCatalogByColumn.get(
        `${expected.tableSchema}.${expected.tableName}.${expected.columnName}`,
      );
      expect(actual).toBeDefined();
      expect(actual?.udt_schema).toBe('public');
      expect(actual?.udt_name).toBe(expected.enumName);
      expect([...(actual?.enum_values ?? [])].sort()).toEqual(
        [...expected.values].sort(),
      );
    }

    const sqlInMemory = await dataSource.driver.createSchemaBuilder().log();
    const upQueries = sqlInMemory.upQueries.map((q) => q.query);

    // A column-level ALTER (e.g. the benign now()/CURRENT_TIMESTAMP
    // default mismatch above) can make TypeORM's schema builder drop and
    // recreate any index that references that column as a side effect,
    // even though the index's own shape is unchanged. Treat a DROP
    // INDEX + CREATE INDEX pair sharing the same index name as a no-op —
    // the fact that TypeORM plans to recreate it identically (same name)
    // is itself the evidence nothing about the index actually changed.
    const dropIndexNames = new Set(
      upQueries
        .map((q) => /^DROP INDEX "[^"]+"\."([^"]+)"$/.exec(q)?.[1])
        .filter((n): n is string => !!n),
    );
    const createIndexNames = new Set(
      upQueries
        .map((q) => /^CREATE (?:UNIQUE )?INDEX "([^"]+)" ON /.exec(q)?.[1])
        .filter((n): n is string => !!n),
    );
    const churnedIndexNames = [...dropIndexNames].filter((n) =>
      createIndexNames.has(n),
    );

    const isPublicEnumRelocationNoise = (query: string): boolean => {
      const columnMatch =
        /^ALTER TABLE "([^"]+)"\."([^"]+)" (?:DROP COLUMN|ADD) "([^"]+)"/.exec(
          query,
        );
      if (
        columnMatch &&
        enumColumnKeys.has(
          `${columnMatch[1]}.${columnMatch[2]}.${columnMatch[3]}`,
        )
      ) {
        return true;
      }

      const typeMatch = /^CREATE TYPE "([^"]+)"\."([^"]+)" AS ENUM/.exec(query);
      return !!(
        typeMatch &&
        generatedEnumTypeKeys.has(`${typeMatch[1]}.${typeMatch[2]}`)
      );
    };

    const unexpected = upQueries.filter((query) => {
      if (KNOWN_BENIGN_DIFF_PATTERNS.some((p) => p.test(query))) return false;
      if (isPublicEnumRelocationNoise(query)) return false;
      const dropMatch = /^DROP INDEX "[^"]+"\."([^"]+)"$/.exec(query);
      if (dropMatch && churnedIndexNames.includes(dropMatch[1])) return false;
      const createMatch = /^CREATE (?:UNIQUE )?INDEX "([^"]+)" ON /.exec(query);
      if (createMatch && churnedIndexNames.includes(createMatch[1]))
        return false;
      return true;
    });

    // Jest's own assertion diff shows the actual queries on failure —
    // no console.log needed (CLAUDE.md forbids it in committed code).
    expect(unexpected).toEqual([]);
  });
});
