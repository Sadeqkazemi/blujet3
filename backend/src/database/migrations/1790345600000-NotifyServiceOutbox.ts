import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Expand-only reliability seam for the phase-1 notify extraction. */
export class NotifyServiceOutbox1790345600000 implements MigrationInterface {
  name = 'NotifyServiceOutbox1790345600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notify_outbox_events" (
        "id" text NOT NULL,
        "eventType" text NOT NULL,
        "payloadEncrypted" text NOT NULL,
        "dedupeKey" text NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "claimedAt" TIMESTAMP(3),
        "claimToken" text,
        "deliveredAt" TIMESTAMP(3),
        "lastError" text,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "notify_outbox_events_pkey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "notify_outbox_events_dedupeKey_key" ON "notify_outbox_events" ("dedupeKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "notify_outbox_events_delivery_idx" ON "notify_outbox_events" ("deliveredAt", "nextAttemptAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "sms_logs" ADD COLUMN "sourceEventId" text`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "sms_logs_sourceEventId_key" ON "sms_logs" ("sourceEventId") WHERE "sourceEventId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "sms_logs_sourceEventId_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sms_logs" DROP COLUMN IF EXISTS "sourceEventId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notify_outbox_events"`);
  }
}
