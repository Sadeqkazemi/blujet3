import type { QueryRunner } from 'typeorm';
import { OpsAdminProjectionInbox1793260800000 } from './ops-admin-migrations/1793260800000-OpsAdminProjectionInbox';

function recordingQueryRunner(statements: string[]): QueryRunner {
  const query = jest.fn((statement: string): Promise<unknown[]> => {
    statements.push(statement);
    return Promise.resolve([]);
  });
  return { query } as unknown as QueryRunner;
}

describe('OpsAdminProjectionInbox1793260800000', () => {
  const migration = new OpsAdminProjectionInbox1793260800000();

  it('adds only ordering evidence and a content-free receipt table', async () => {
    const statements: string[] = [];
    await migration.up(recordingQueryRunner(statements));
    const sql = statements.join('\n');

    expect(sql).toContain('ADD COLUMN "taskVersion" integer');
    expect(sql).toContain('ADD COLUMN "auditId" text');
    expect(sql).toContain('ADD COLUMN "fingerprint" character(64)');
    expect(sql).toContain(
      'CREATE TABLE "ops"."cartable_projection_event_receipts"',
    );
    expect(sql.match(/CREATE TABLE /g) ?? []).toHaveLength(1);
    expect(sql).not.toContain('FOREIGN KEY');
    for (const forbidden of [
      'title',
      'description',
      'attachments',
      'senderId',
      'conversationId',
      'resolutionNote',
    ]) {
      expect(sql).not.toContain(`"${forbidden}"`);
    }
  });

  it('rolls back only this additive slice', async () => {
    const statements: string[] = [];
    await migration.down(recordingQueryRunner(statements));
    const sql = statements.join('\n');

    expect(sql).toContain(
      'DROP TABLE IF EXISTS "ops"."cartable_projection_event_receipts"',
    );
    expect(sql).toContain('DROP COLUMN IF EXISTS "taskVersion"');
    expect(sql).not.toContain('DROP SCHEMA');
    expect(sql).not.toContain('DROP TABLE "ops"."cartable_tasks"');
  });
});
