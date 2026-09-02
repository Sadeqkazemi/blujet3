import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Payout ledger for atomic walletCreditReference claims
 * (INSERT ON CONFLICT DO NOTHING — no aborted-tx 23505 handling).
 */
export class V4LoanWalletCreditLedger1787212800000 implements MigrationInterface {
  name = 'V4LoanWalletCreditLedger1787212800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bank_loan_wallet_credits" (
        "creditReference" text NOT NULL,
        "loanApplicationId" text NOT NULL,
        "userId" text NOT NULL,
        "amountIrr" bigint NOT NULL,
        "walletEntryId" text,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "bank_loan_wallet_credits_pkey" PRIMARY KEY ("creditReference")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "bank_loan_wallet_credits_loanApplicationId_idx"
      ON "bank_loan_wallet_credits" ("loanApplicationId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bank_loan_wallet_credits"`);
  }
}
