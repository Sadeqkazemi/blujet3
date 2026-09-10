import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bootstrap migration for a fresh physical Notify database.
 *
 * It intentionally fails if a pre-existing notify table is present. Pointing
 * this DataSource at the shared Core database must not silently become a
 * second writer or overwrite the phase-5 schema.
 */
export class CreateNotifyDatabase1793000000000 implements MigrationInterface {
  public readonly name = 'CreateNotifyDatabase1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA IF NOT EXISTS "notify"');
    await queryRunner.query(
      `CREATE TYPE "notify"."NotificationCategory" AS ENUM('CARTABLE', 'MESSAGE', 'REQUEST', 'APPROVAL', 'SYSTEM')`,
    );
    await queryRunner.query(
      `CREATE TYPE "notify"."SmsMessageType" AS ENUM('OTP', 'TEMP_PASSWORD', 'SURVEY_INVITE', 'FLIGHT_CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "notify"."SmsStatus" AS ENUM('SUCCESS', 'FAILED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "notify"."notifications" (
        "id" text NOT NULL,
        "recipientId" text NOT NULL,
        "category" "notify"."NotificationCategory" NOT NULL,
        "action" text NOT NULL,
        "title" text NOT NULL,
        "body" text,
        "entityType" text,
        "entityId" text,
        "dedupeKey" text,
        "readAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "notifications_recipientId_readAt_idx" ON "notify"."notifications" ("recipientId", "readAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "notifications_recipientId_category_readAt_idx" ON "notify"."notifications" ("recipientId", "category", "readAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notify"."notifications" ("dedupeKey")`,
    );

    await queryRunner.query(`
      CREATE TABLE "notify"."sms_logs" (
        "id" text NOT NULL,
        "phone" text,
        "messageType" "notify"."SmsMessageType" NOT NULL,
        "status" "notify"."SmsStatus" NOT NULL,
        "failureReason" text,
        "sourceEventId" text,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "sms_logs_createdAt_idx" ON "notify"."sms_logs" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "sms_logs_sourceEventId_key" ON "notify"."sms_logs" ("sourceEventId") WHERE "sourceEventId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "notify"."sms_logs"');
    await queryRunner.query('DROP TABLE IF EXISTS "notify"."notifications"');
    await queryRunner.query('DROP TYPE IF EXISTS "notify"."SmsStatus"');
    await queryRunner.query('DROP TYPE IF EXISTS "notify"."SmsMessageType"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "notify"."NotificationCategory"',
    );
    await queryRunner.query('DROP SCHEMA IF EXISTS "notify"');
  }
}
