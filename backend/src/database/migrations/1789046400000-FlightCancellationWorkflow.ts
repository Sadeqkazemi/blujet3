import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FlightCancellationWorkflow1789046400000
  implements MigrationInterface
{
  name = 'FlightCancellationWorkflow1789046400000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."SmsMessageType" ADD VALUE IF NOT EXISTS 'FLIGHT_CANCELLED'`,
    );
    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "cancellationReason" text,
        ADD COLUMN IF NOT EXISTS "cancelledByUserId" text
    `);
    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        ADD CONSTRAINT "flight_instances_cancelledByUserId_fkey"
        FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "flight_instances_cancelledAt_idx"
      ON "flight_instances" ("cancelledAt")
      WHERE "status" = 'CANCELLED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "flight_instances_cancelledAt_idx"`,
    );
    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        DROP CONSTRAINT IF EXISTS "flight_instances_cancelledByUserId_fkey"
    `);
    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        DROP COLUMN IF EXISTS "cancelledByUserId",
        DROP COLUMN IF EXISTS "cancellationReason",
        DROP COLUMN IF EXISTS "cancelledAt"
    `);
    // PostgreSQL cannot remove one enum value safely; keep the additive SMS
    // value on rollback so existing sms_logs remain readable.
  }
}
