import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CartableConversationId1790000000000 implements MigrationInterface {
  name = 'CartableConversationId1790000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cartable_tasks" ADD "conversationId" text`,
    );
    await queryRunner.query(
      `CREATE INDEX "cartable_tasks_conversationId_createdAt_idx" ON "cartable_tasks" ("conversationId", "createdAt")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."cartable_tasks_conversationId_createdAt_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cartable_tasks" DROP COLUMN "conversationId"`,
    );
  }
}
