import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Unread state for cartable tasks — backs GET /cartable/:id (marks read on
 * first view) and GET /cartable/unread-count. Additive; existing rows are
 * NULL (never viewed), matching pre-migration behavior where every open
 * task was effectively "unread".
 */
export class CartableTaskReadAt1786867200000 implements MigrationInterface {
  name = 'CartableTaskReadAt1786867200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cartable_tasks" ADD "readAt" TIMESTAMP(3)`,
    );
    await queryRunner.query(
      `CREATE INDEX "cartable_tasks_assigneeId_readAt_idx" ON "cartable_tasks" ("assigneeId", "readAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."cartable_tasks_assigneeId_readAt_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cartable_tasks" DROP COLUMN IF EXISTS "readAt"`,
    );
  }
}
