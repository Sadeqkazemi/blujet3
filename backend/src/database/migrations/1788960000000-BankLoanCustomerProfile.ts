import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BankLoanCustomerProfile1788960000000 implements MigrationInterface {
  name = 'BankLoanCustomerProfile1788960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bank_loan_customer_profiles" (
        "userId" text NOT NULL,
        "membershipStatus" text NOT NULL DEFAULT 'UNDECLARED',
        "customerNumberEnc" text,
        "customerNumberLast4" varchar(4),
        "accountOpeningStatus" text NOT NULL DEFAULT 'NOT_STARTED',
        "accountOpeningReferenceId" text,
        "accountOpeningSummary" jsonb,
        "eligibilityStatus" text NOT NULL DEFAULT 'NOT_STARTED',
        "eligibilityReferenceId" text,
        "eligibleAmountIrr" bigint,
        "eligibilitySummary" jsonb,
        "lastSyncedAt" timestamp(3),
        "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "bank_loan_customer_profiles_pkey" PRIMARY KEY ("userId"),
        CONSTRAINT "bank_loan_customer_profiles_accountOpeningReferenceId_key" UNIQUE ("accountOpeningReferenceId"),
        CONSTRAINT "bank_loan_customer_profiles_eligibilityReferenceId_key" UNIQUE ("eligibilityReferenceId"),
        CONSTRAINT "bank_loan_customer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "bank_loan_customer_profiles_membership_check" CHECK ("membershipStatus" IN ('UNDECLARED','BANK_CUSTOMER','ACCOUNT_OPENING_REQUESTED','ACCOUNT_OPENED')),
        CONSTRAINT "bank_loan_customer_profiles_opening_check" CHECK ("accountOpeningStatus" IN ('NOT_STARTED','SUBMITTED','UNDER_REVIEW','COMPLETED','REJECTED','FAILED')),
        CONSTRAINT "bank_loan_customer_profiles_eligibility_check" CHECK ("eligibilityStatus" IN ('NOT_STARTED','SUBMITTED','UNDER_REVIEW','ELIGIBLE','INELIGIBLE','FAILED')),
        CONSTRAINT "bank_loan_customer_profiles_eligible_amount_check" CHECK ("eligibleAmountIrr" IS NULL OR "eligibleAmountIrr" > 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "bank_loan_customer_profiles"');
  }
}
