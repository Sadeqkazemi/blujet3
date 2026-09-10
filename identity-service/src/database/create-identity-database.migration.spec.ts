import type { QueryRunner } from 'typeorm';
import { CreateIdentityDatabase1793088180000 } from './migrations/1793088180000-CreateIdentityDatabase';

const OWNED_TABLES = [
  'users',
  'refresh_tokens',
  'two_factor_challenges',
  'password_reset_events',
  'security_policy',
  'customer_identity_verifications',
] as const;

function recordingQueryRunner(statements: string[]): QueryRunner {
  const query = jest.fn((statement: string): Promise<unknown[]> => {
    statements.push(statement);
    return Promise.resolve([]);
  });
  return { query } as unknown as QueryRunner;
}

describe('CreateIdentityDatabase1793088180000', () => {
  const migration = new CreateIdentityDatabase1793088180000();

  it('creates exactly the six Identity-owned tables and six enums', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    for (const table of OWNED_TABLES) {
      expect(sql).toContain(`CREATE TABLE "identity"."${table}"`);
    }
    expect(sql.match(/CREATE TABLE /g) ?? []).toHaveLength(OWNED_TABLES.length);
    expect(sql.match(/CREATE TYPE /g) ?? []).toHaveLength(6);
  });

  it('keeps all foreign keys inside the Identity boundary', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const foreignKeys = statements.filter((statement) =>
      statement.includes('FOREIGN KEY'),
    );
    expect(foreignKeys).toHaveLength(7);
    expect(
      foreignKeys.every((statement) =>
        statement.includes('REFERENCES "identity"."users"'),
      ),
    ).toBe(true);
    expect(statements.join('\n')).not.toMatch(
      /"(orders|inventory|payments|agency|loyalty|experience|notify|reporting)"\./i,
    );
  });

  it('keeps the Experience file ID as a scalar reference', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const table = statements.find((statement) =>
      statement.includes('CREATE TABLE "identity"."customer_identity_verifications"'),
    );
    expect(table).toContain('"idCardFileId" text');
    expect(
      statements.some(
        (statement) =>
          statement.includes('FOREIGN KEY ("idCardFileId")') ||
          statement.includes('FOREIGN KEY("idCardFileId")'),
      ),
    ).toBe(false);
  });

  it('removes only the Identity schema on rollback', async () => {
    const statements: string[] = [];

    await migration.down(recordingQueryRunner(statements));

    expect(statements).toEqual(['DROP SCHEMA IF EXISTS "identity" CASCADE']);
  });
});
