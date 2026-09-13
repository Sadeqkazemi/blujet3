import type { QueryRunner } from 'typeorm';
import { AgencyVersionedProjection1793865600000 } from './migrations/1793865600000-AgencyVersionedProjection';

function recordingQueryRunner(statements: string[]): QueryRunner {
  const query = jest.fn((statement: string): Promise<unknown[]> => {
    statements.push(statement);
    return Promise.resolve([]);
  });
  return { query } as unknown as QueryRunner;
}

describe('AgencyVersionedProjection1793865600000', () => {
  const migration = new AgencyVersionedProjection1793865600000();

  it('adds positive versions and only the two projection control tables', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    expect(sql.match(/ADD "version" integer NOT NULL DEFAULT 1/g)).toHaveLength(
      3,
    );
    expect(sql).toContain(
      'CREATE TABLE "agency"."agency_projection_event_receipts"',
    );
    expect(sql).toContain('CREATE TABLE "agency"."agency_projection_slots"');
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(2);
    expect(sql).not.toMatch(
      /"(identity|orders|inventory|payments|loyalty|experience|notify|reporting)"\./i,
    );
  });

  it('guards receipt immutability and removes only additive objects', async () => {
    const up: string[] = [];
    const down: string[] = [];

    await migration.up(recordingQueryRunner(up));
    await migration.down(recordingQueryRunner(down));

    expect(up.join('\n')).toContain(
      'BEFORE UPDATE OR DELETE ON "agency"."agency_projection_event_receipts"',
    );
    expect(down[0]).toBe('DROP TABLE "agency"."agency_projection_slots"');
    expect(down.join('\n').match(/DROP COLUMN "version"/g)).toHaveLength(3);
    expect(down.join('\n')).not.toContain('DROP SCHEMA');
  });
});
