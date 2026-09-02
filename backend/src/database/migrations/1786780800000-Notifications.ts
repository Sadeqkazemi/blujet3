import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * In-app notifications: GET /notifications, /notifications/unread-count,
 * PATCH /notifications/:id/read, /notifications/read-all. `recipientId` is
 * a plain (relation-less) column — same TS2589-avoidance / schema-parity
 * convention as every other new back-reference column added in this PR
 * (no DB-level FK constraint, since the entity declares no relation).
 * Additive; touches no existing table.
 */
export class Notifications1786780800000 implements MigrationInterface {
  name = 'Notifications1786780800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."NotificationCategory" AS ENUM('CARTABLE', 'MESSAGE', 'REQUEST', 'APPROVAL', 'SYSTEM')`,
    );

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" text NOT NULL,
        "recipientId" text NOT NULL,
        "category" "public"."NotificationCategory" NOT NULL,
        "action" text NOT NULL,
        "title" text NOT NULL,
        "body" text,
        "entityType" text,
        "entityId" text,
        "dedupeKey" text,
        "readAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "notifications_recipientId_readAt_idx" ON "notifications" ("recipientId", "readAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "notifications_recipientId_category_readAt_idx" ON "notifications" ("recipientId", "category", "readAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications" ("dedupeKey")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."NotificationCategory"`,
    );
  }
}
