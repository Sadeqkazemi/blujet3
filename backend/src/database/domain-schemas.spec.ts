import 'reflect-metadata';
import { getMetadataArgsStorage, QueryRunner } from 'typeorm';
import { dataSourceOptions } from './data-source.options';
import {
  DOMAIN_SCHEMA_TABLES,
  DomainSchemas1790524800000,
} from './migrations/1790524800000-DomainSchemas';

type DomainSchema = keyof typeof DOMAIN_SCHEMA_TABLES;

const schemas = Object.keys(DOMAIN_SCHEMA_TABLES) as DomainSchema[];
const expectedEntries: Array<{ schema: DomainSchema; table: string }> = [];
for (const schema of schemas) {
  for (const table of DOMAIN_SCHEMA_TABLES[schema] as readonly string[]) {
    expectedEntries.push({ schema, table });
  }
}

function queryRunnerMock() {
  const query = jest.fn<Promise<unknown>, [string]>().mockResolvedValue([]);
  return { query, runner: { query } as unknown as QueryRunner };
}

describe('domain schema ownership', () => {
  it('assigns every backend entity to exactly one migration-owned schema', () => {
    // Importing dataSourceOptions registers all backend entity decorators.
    expect(dataSourceOptions.entities).toBeDefined();

    const expectedTables = new Set(expectedEntries.map(({ table }) => table));
    const entityTables = getMetadataArgsStorage().tables.filter(
      ({ name, type }) =>
        type === 'regular' && name && expectedTables.has(name),
    );

    expect(entityTables).toHaveLength(expectedEntries.length);
    expect(
      entityTables.map(({ name, schema }) => `${schema}.${name}`).sort(),
    ).toEqual(
      expectedEntries.map(({ schema, table }) => `${schema}.${table}`).sort(),
    );
  });

  it('moves every table once and creates a public compatibility view', async () => {
    const { query, runner } = queryRunnerMock();

    await new DomainSchemas1790524800000().up(runner);

    const statements = query.mock.calls.map(([statement]) => statement);
    expect(statements).toHaveLength(
      schemas.length + expectedEntries.length * 2,
    );

    for (const schema of schemas) {
      expect(statements).toContain(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    }
    for (const { schema, table } of expectedEntries) {
      expect(statements).toContain(
        `ALTER TABLE "public"."${table}" SET SCHEMA "${schema}"`,
      );
      expect(statements).toContain(
        `CREATE VIEW "public"."${table}" WITH (security_invoker = true) AS SELECT * FROM "${schema}"."${table}"`,
      );
    }
  });

  it('drops compatibility views before moving every table back', async () => {
    const { query, runner } = queryRunnerMock();

    await new DomainSchemas1790524800000().down(runner);

    const statements = query.mock.calls.map(([statement]) => statement);
    const lastDropView = Math.max(
      ...statements.map((statement, index) =>
        statement.startsWith('DROP VIEW') ? index : -1,
      ),
    );
    const firstMove = statements.findIndex((statement) =>
      statement.startsWith('ALTER TABLE'),
    );

    expect(lastDropView).toBeLessThan(firstMove);
    for (const { schema, table } of expectedEntries) {
      expect(statements).toContain(`DROP VIEW IF EXISTS "public"."${table}"`);
      expect(statements).toContain(
        `ALTER TABLE "${schema}"."${table}" SET SCHEMA "public"`,
      );
    }
    for (const schema of schemas) {
      expect(statements).toContain(`DROP SCHEMA IF EXISTS "${schema}"`);
    }
  });
});
