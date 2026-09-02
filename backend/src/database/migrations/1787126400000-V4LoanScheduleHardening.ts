import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Harden V4 loans + schedule templates:
 * - loan idempotency unique(userId, idempotencyKey)
 * - unique walletCreditReference (partial, non-null)
 * - bank_loan_webhook_events with unique(provider, eventId)
 */
export class V4LoanScheduleHardening1787126400000 implements MigrationInterface {
  name = 'V4LoanScheduleHardening1787126400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bank_loan_applications"
        DROP CONSTRAINT IF EXISTS "bank_loan_applications_idempotencyKey_key"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "bank_loan_applications_idempotencyKey_key"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "bank_loan_applications_userId_idempotencyKey_key"
      ON "bank_loan_applications" ("userId", "idempotencyKey")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "bank_loan_applications_walletCreditReference_key"
      ON "bank_loan_applications" ("walletCreditReference")
      WHERE "walletCreditReference" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "bank_loan_applications"
        ADD COLUMN IF NOT EXISTS "lastWebhookOccurredAt" TIMESTAMP(3)
    `);

    await queryRunner.query(`
      CREATE TABLE "bank_loan_webhook_events" (
        "id" text NOT NULL,
        "provider" text NOT NULL,
        "eventId" text NOT NULL,
        "bankReferenceId" text,
        "loanApplicationId" text,
        "bankStatus" text,
        "occurredAt" TIMESTAMP(3),
        "payloadRedacted" jsonb,
        "processingResult" text NOT NULL DEFAULT 'APPLIED',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "bank_loan_webhook_events_pkey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "bank_loan_webhook_events_provider_eventId_key"
      ON "bank_loan_webhook_events" ("provider", "eventId")
    `);
    await queryRunner.query(`
      CREATE INDEX "bank_loan_webhook_events_bankReferenceId_idx"
      ON "bank_loan_webhook_events" ("bankReferenceId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bank_loan_webhook_events"`);
    await queryRunner.query(`
      ALTER TABLE "bank_loan_applications"
        DROP COLUMN IF EXISTS "lastWebhookOccurredAt"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "bank_loan_applications_walletCreditReference_key"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "bank_loan_applications_userId_idempotencyKey_key"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "bank_loan_applications_idempotencyKey_key"
      ON "bank_loan_applications" ("idempotencyKey")
    `);
  }
}
