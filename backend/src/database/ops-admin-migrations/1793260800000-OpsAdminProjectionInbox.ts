import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OpsAdminProjectionInbox1793260800000 implements MigrationInterface {
  public readonly name = 'OpsAdminProjectionInbox1793260800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "ops"."cartable_tasks" ADD COLUMN "taskVersion" integer',
    );
    await queryRunner.query(
      'ALTER TABLE "ops"."cartable_tasks" ADD COLUMN "auditId" text',
    );
    await queryRunner.query(
      'ALTER TABLE "ops"."cartable_tasks" ADD COLUMN "fingerprint" character(64)',
    );
    await queryRunner.query(
      'ALTER TABLE "ops"."cartable_tasks" ADD CONSTRAINT "ops_admin_cartable_task_version_check" CHECK ("taskVersion" IS NULL OR "taskVersion" > 0)',
    );
    await queryRunner.query(`CREATE TABLE "ops"."cartable_projection_event_receipts" (
      "eventId" uuid NOT NULL,
      "fingerprint" character(64) NOT NULL,
      "taskId" text NOT NULL,
      "taskVersion" integer NOT NULL,
      "receivedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "ops_admin_cartable_receipt_version_check" CHECK ("taskVersion" > 0),
      CONSTRAINT "cartable_projection_event_receipts_pkey" PRIMARY KEY ("eventId")
    )`);
    await queryRunner.query(
      'CREATE INDEX "ops_admin_cartable_receipt_task_version_idx" ON "ops"."cartable_projection_event_receipts" ("taskId", "taskVersion")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "ops"."cartable_projection_event_receipts"',
    );
    await queryRunner.query(
      'ALTER TABLE "ops"."cartable_tasks" DROP CONSTRAINT IF EXISTS "ops_admin_cartable_task_version_check"',
    );
    await queryRunner.query(
      'ALTER TABLE "ops"."cartable_tasks" DROP COLUMN IF EXISTS "fingerprint"',
    );
    await queryRunner.query(
      'ALTER TABLE "ops"."cartable_tasks" DROP COLUMN IF EXISTS "auditId"',
    );
    await queryRunner.query(
      'ALTER TABLE "ops"."cartable_tasks" DROP COLUMN IF EXISTS "taskVersion"',
    );
  }
}
