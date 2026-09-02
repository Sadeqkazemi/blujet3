import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Loan initiation lifecycle: INITIATING status + lease timestamps so
 * bankReferenceId=null rows are never stuck as permanent SUBMITTED.
 */
export class V4LoanInitiationLifecycle1787299200000 implements MigrationInterface {
  name = 'V4LoanInitiationLifecycle1787299200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."BankLoanStatus" ADD VALUE IF NOT EXISTS 'INITIATING'
    `);
    await queryRunner.query(`
      ALTER TABLE "bank_loan_applications"
        ADD COLUMN IF NOT EXISTS "initiationStartedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "initiationLeaseUntil" TIMESTAMP(3)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "bank_loan_applications_initiationLeaseUntil_idx"
      ON "bank_loan_applications" ("initiationLeaseUntil")
      WHERE "bankReferenceId" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "bank_loan_applications_initiationLeaseUntil_idx"
    `);
    await queryRunner.query(`
      ALTER TABLE "bank_loan_applications"
        DROP COLUMN IF EXISTS "initiationLeaseUntil",
        DROP COLUMN IF EXISTS "initiationStartedAt"
    `);
    // Postgres cannot remove enum values safely; leave INITIATING in the type.
  }
}
