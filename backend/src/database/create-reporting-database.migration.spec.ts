import type { QueryRunner } from 'typeorm';
import { CreateReportingDatabase1793088000000 } from './reporting-migrations/1793088000000-CreateReportingDatabase';

const OWNED_TABLES = [
  'core_itinerary_event_projections',
  'core_itinerary_event_receipts',
  'kafka_consumer_checkpoints',
  'kafka_processing_failures',
] as const;

function recordingQueryRunner(statements: string[]): QueryRunner {
  const query = jest.fn((statement: string): Promise<unknown[]> => {
    statements.push(statement);
    return Promise.resolve([]);
  });
  return { query } as unknown as QueryRunner;
}

describe('CreateReportingDatabase1793088000000', () => {
  const migration = new CreateReportingDatabase1793088000000();

  it('creates exactly the Reporting-owned tables', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    for (const table of OWNED_TABLES) {
      expect(sql).toContain(`CREATE TABLE "reporting"."${table}"`);
    }
    expect(sql.match(/CREATE TABLE /g) ?? []).toHaveLength(OWNED_TABLES.length);
  });

  it('contains no cross-domain table or foreign-key dependency', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    expect(sql).not.toContain('FOREIGN KEY');
    expect(sql).not.toMatch(
      /"(identity|orders|inventory|payments|agency|loyalty|experience|notify)"\./i,
    );
  });

  it('drops the Reporting schema last', async () => {
    const statements: string[] = [];

    await migration.down(recordingQueryRunner(statements));

    expect(statements.at(-1)).toBe('DROP SCHEMA IF EXISTS "reporting"');
  });
});
