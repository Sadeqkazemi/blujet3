import type { QueryRunner } from 'typeorm';
import { CreateExperienceDatabase1793088000000 } from './migrations/1793088000000-CreateExperienceDatabase';

const OWNED_TABLES = [
  'blog_posts',
  'careers_settings',
  'contact_messages',
  'job_applications',
  'job_postings',
  'site_content_blocks',
  'site_destination_highlights',
  'site_media_assets',
  'site_route_highlights',
  'stored_files',
  'support_tickets',
  'survey_invites',
  'survey_questions',
  'survey_responses',
  'survey_settings',
] as const;

function recordingQueryRunner(statements: string[]): QueryRunner {
  const query = jest.fn((statement: string): Promise<unknown[]> => {
    statements.push(statement);
    return Promise.resolve([]);
  });
  return { query } as unknown as QueryRunner;
}

describe('CreateExperienceDatabase1793088000000', () => {
  const migration = new CreateExperienceDatabase1793088000000();

  it('creates exactly the Experience-owned tables', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    expect(statements[0]).toBe('CREATE SCHEMA IF NOT EXISTS "experience"');
    for (const table of OWNED_TABLES) {
      expect(sql).toContain(`CREATE TABLE "experience"."${table}"`);
    }
    expect(sql.match(/CREATE TABLE /g) ?? []).toHaveLength(OWNED_TABLES.length);
  });

  it('contains only the internal media-to-file foreign key', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const foreignKeys = statements.filter((statement) =>
      statement.includes('FOREIGN KEY'),
    );
    expect(foreignKeys).toHaveLength(1);
    expect(foreignKeys[0]).toContain('"experience"."site_media_assets"');
    expect(foreignKeys[0]).toContain(
      'REFERENCES "experience"."stored_files"("id")',
    );
    expect(statements.join('\n')).not.toMatch(
      /"(identity|orders|inventory|payments|agency|loyalty)"\./i,
    );
  });

  it('drops the Experience schema last', async () => {
    const statements: string[] = [];

    await migration.down(recordingQueryRunner(statements));

    expect(statements.at(-1)).toBe('DROP SCHEMA IF EXISTS "experience"');
  });
});
