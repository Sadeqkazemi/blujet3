import type { QueryRunner } from 'typeorm';
import { LoyaltyProjectionOutboxFoundation1793347200000 } from './migrations/1793347200000-LoyaltyProjectionOutboxFoundation';

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

describe('LoyaltyProjectionOutboxFoundation1793347200000', () => {
  const migration = new LoyaltyProjectionOutboxFoundation1793347200000();

  it('adds a positive version to every Loyalty-owned source row', async () => {
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
    expect(sql.match(/ADD "version"/g) ?? []).toHaveLength(
      LOYALTY_TABLES.length,
    );
  });

  it('creates immutable content-free projection evidence', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    expect(sql).toContain('CREATE TABLE "loyalty"."loyalty_projection_audits"');
    expect(sql).toContain('"aggregateType", "aggregateId", "recordVersion"');
    expect(sql).toContain(
      'BEFORE UPDATE OR DELETE ON "loyalty"."loyalty_projection_audits"',
    );
    expect(sql).not.toMatch(
      /"(fullName|email|nationalId|cardNo|history|lockedPriceIrr|feeIrr)"/,
    );
  });

  it('rolls back only the additive projection foundation', async () => {
    const statements: string[] = [];

    await migration.down(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    expect(sql).toContain('DROP TABLE "loyalty"."loyalty_projection_audits"');
    for (const table of LOYALTY_TABLES) {
      expect(sql).toContain(
        `ALTER TABLE "loyalty"."${table}" DROP COLUMN "version"`,
      );
    }
    expect(sql).not.toContain('DROP SCHEMA');
    expect(sql).not.toMatch(/DROP TABLE "loyalty"\."club_/);
  });
});
