import type { QueryRunner } from 'typeorm';
import { CreateOpsAdminProjectionDatabase1793088360000 } from './ops-admin-migrations/1793088360000-CreateOpsAdminProjectionDatabase';

function recordingQueryRunner(statements: string[]): QueryRunner {
  const query = jest.fn((statement: string): Promise<unknown[]> => {
    statements.push(statement);
    return Promise.resolve([]);
  });
  return { query } as unknown as QueryRunner;
}

describe('CreateOpsAdminProjectionDatabase1793088360000', () => {
  const migration = new CreateOpsAdminProjectionDatabase1793088360000();

  it('creates one table and the three cartable enum types', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    expect(sql).toContain('CREATE TABLE "ops"."cartable_tasks"');
    expect(sql.match(/CREATE TABLE /g) ?? []).toHaveLength(1);
    expect(sql.match(/CREATE TYPE /g) ?? []).toHaveLength(3);
  });

  it('keeps content, identity joins and foreign keys out of the projection', async () => {
    const statements: string[] = [];

    await migration.up(recordingQueryRunner(statements));

    const sql = statements.join('\n');
    for (const column of [
      'title',
      'description',
      'attachments',
      'senderId',
      'senderLabelFa',
      'conversationId',
      'resolutionNote',
      'transferredToId',
    ]) {
      expect(sql).not.toContain(`"${column}"`);
    }
    expect(sql).not.toContain('FOREIGN KEY');
    expect(sql).not.toMatch(
      /"(identity|orders|inventory|payments|agency|loyalty|experience|notify)"\./i,
    );
  });

  it('drops only the Ops projection schema', async () => {
    const statements: string[] = [];

    await migration.down(recordingQueryRunner(statements));

    expect(statements).toEqual(['DROP SCHEMA IF EXISTS "ops" CASCADE']);
  });
});
