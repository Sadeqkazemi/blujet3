import type { QueryRunner } from 'typeorm';
import { CreateAgencyProjectionDatabase1793088120000 } from './migrations/1793088120000-CreateAgencyProjectionDatabase';

const OWNED_PROJECTIONS = [
  'agency_profiles',
  'agency_invoices',
  'agency_credit_requests',
] as const;

function recordingQueryRunner(statements: string[]): QueryRunner {
  const query = jest.fn((statement: string): Promise<unknown[]> => {
    statements.push(statement);
    return Promise.resolve([]);
  });
  return { query } as unknown as QueryRunner;
}

describe('CreateAgencyProjectionDatabase1793088120000', () => {
  const migration = new CreateAgencyProjectionDatabase1793088120000();

  it('creates exactly the three current Agency read projections', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    for (const table of OWNED_PROJECTIONS) {
      expect(sql).toContain(`CREATE TABLE "agency"."${table}"`);
    }
    expect(sql.match(/CREATE TABLE /g) ?? []).toHaveLength(
      OWNED_PROJECTIONS.length,
    );
    expect(sql.match(/CREATE TYPE /g) ?? []).toHaveLength(3);
  });

  it('keeps only child-to-profile internal foreign keys', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const foreignKeys = statements.filter((statement) =>
      statement.includes('FOREIGN KEY'),
    );
    expect(foreignKeys).toHaveLength(2);
    expect(
      foreignKeys.every((statement) =>
        statement.includes('REFERENCES "agency"."agency_profiles"'),
      ),
    ).toBe(true);
    expect(statements.join('\n')).not.toMatch(
      /"(identity|orders|inventory|payments|loyalty|experience|notify|reporting)"\./i,
    );
  });

  it('removes only the Agency schema on rollback', async () => {
    const statements: string[] = [];

    await migration.down(recordingQueryRunner(statements));

    expect(statements).toEqual(['DROP SCHEMA IF EXISTS "agency" CASCADE']);
  });
});
