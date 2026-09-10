import type { QueryRunner } from 'typeorm';
import { CreateLoyaltyDatabase1793088060000 } from './migrations/1793088060000-CreateLoyaltyDatabase';

const OWNED_TABLES = [
  'club_members',
  'club_points_entries',
  'club_card_requests',
  'club_tier_rules',
  'price_locks',
  'customer_referrals',
] as const;

function recordingQueryRunner(statements: string[]): QueryRunner {
  const query = jest.fn((statement: string): Promise<unknown[]> => {
    statements.push(statement);
    return Promise.resolve([]);
  });
  return { query } as unknown as QueryRunner;
}

describe('CreateLoyaltyDatabase1793088060000', () => {
  const migration = new CreateLoyaltyDatabase1793088060000();

  it('creates exactly the six Loyalty-owned tables and eight enums', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    for (const table of OWNED_TABLES) {
      expect(sql).toContain(`CREATE TABLE "loyalty"."${table}"`);
    }
    expect(sql.match(/CREATE TABLE /g) ?? []).toHaveLength(OWNED_TABLES.length);
    expect(sql.match(/CREATE TYPE /g) ?? []).toHaveLength(8);
  });

  it('keeps only member-owned internal foreign keys', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const foreignKeys = statements.filter((statement) =>
      statement.includes('FOREIGN KEY'),
    );
    expect(foreignKeys).toHaveLength(2);
    expect(
      foreignKeys.every((statement) =>
        statement.includes('REFERENCES "loyalty"."club_members"'),
      ),
    ).toBe(true);
    expect(statements.join('\n')).not.toMatch(
      /"(identity|orders|inventory|payments|agency|experience|notify|reporting)"\./i,
    );
  });

  it('removes only the Loyalty schema on rollback', async () => {
    const statements: string[] = [];

    await migration.down(recordingQueryRunner(statements));

    expect(statements).toEqual(['DROP SCHEMA IF EXISTS "loyalty" CASCADE']);
  });
});
