import type { QueryRunner } from 'typeorm';
import { LoyaltyProjectionVersions1793347200000 } from './migrations/1793347200000-LoyaltyProjectionVersions';

const LOYALTY_TABLES = [
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

describe('LoyaltyProjectionVersions1793347200000', () => {
  const migration = new LoyaltyProjectionVersions1793347200000();

  it('keeps all six target tables version-compatible with Core', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    for (const table of LOYALTY_TABLES) {
      expect(sql).toContain(
        `ALTER TABLE "loyalty"."${table}" ADD "version" integer NOT NULL DEFAULT 1`,
      );
      expect(sql).toContain(
        `CONSTRAINT "${table}_version_check" CHECK ("version" > 0)`,
      );
    }
    expect(sql).not.toContain('CREATE TABLE');
    expect(sql).not.toContain('FOREIGN KEY');
  });

  it('removes only version metadata on rollback', async () => {
    const statements: string[] = [];

    await migration.down(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    for (const table of LOYALTY_TABLES) {
      expect(sql).toContain(
        `ALTER TABLE "loyalty"."${table}" DROP COLUMN "version"`,
      );
    }
    expect(sql).not.toContain('DROP SCHEMA');
    expect(sql).not.toContain('DROP TABLE');
  });
});
