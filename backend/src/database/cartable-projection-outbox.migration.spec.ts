import type { QueryRunner } from 'typeorm';
import { CartableProjectionOutbox1793174400000 } from './migrations/1793174400000-CartableProjectionOutbox';

function recordingRunner(statements: string[]): QueryRunner {
  return {
    query: jest.fn((statement: string): Promise<unknown[]> => {
      statements.push(statement);
      return Promise.resolve([]);
    }),
  } as unknown as QueryRunner;
}

describe('CartableProjectionOutbox1793174400000', () => {
  it('adds a positive source version and content-free audit evidence', async () => {
    const statements: string[] = [];

    await new CartableProjectionOutbox1793174400000().up(
      recordingRunner(statements),
    );

    const sql = statements.join('\n');
    expect(sql).toContain(
      'ALTER TABLE "ops"."cartable_tasks" ADD "version" integer NOT NULL DEFAULT 1',
    );
    expect(sql).toContain('CREATE TABLE "ops"."cartable_projection_audits"');
    expect(sql).toContain('UNIQUE INDEX');
    expect(sql).toContain('"taskId", "taskVersion"');
    expect(sql).toContain('reject_cartable_projection_audit_mutation');
    expect(sql).toContain('cartable_projection_audits_immutable_guard');
    expect(sql).not.toMatch(
      /title|description|attachments|senderId|conversationId|resolutionNote/,
    );
  });

  it('reverts only the additive audit and version fields', async () => {
    const statements: string[] = [];

    await new CartableProjectionOutbox1793174400000().down(
      recordingRunner(statements),
    );

    expect(statements).toEqual([
      'DROP TRIGGER IF EXISTS "cartable_projection_audits_immutable_guard" ON "ops"."cartable_projection_audits"',
      'DROP FUNCTION IF EXISTS "ops"."reject_cartable_projection_audit_mutation"()',
      'DROP TABLE "ops"."cartable_projection_audits"',
      'ALTER TABLE "ops"."cartable_tasks" DROP CONSTRAINT "cartable_tasks_version_check"',
      'ALTER TABLE "ops"."cartable_tasks" DROP COLUMN "version"',
    ]);
  });
});
