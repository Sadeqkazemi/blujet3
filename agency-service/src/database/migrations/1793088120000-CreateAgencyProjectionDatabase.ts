import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgencyProjectionDatabase1793088120000 implements MigrationInterface {
  public readonly name = 'CreateAgencyProjectionDatabase1793088120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA IF NOT EXISTS "agency"');
    await queryRunner.query(
      `CREATE TYPE "agency"."AgencyTier" AS ENUM('NORMAL', 'SILVER', 'GOLD')`,
    );
    await queryRunner.query(
      `CREATE TYPE "agency"."AgencyInvoiceStatus" AS ENUM('UNPAID', 'PAID', 'OVERDUE', 'VOIDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "agency"."AgencyCreditRequestStatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );

    await queryRunner.query(`CREATE TABLE "agency"."agency_profiles" (
      "userId" text NOT NULL,
      "licenseNo" text NOT NULL,
      "managerName" text NOT NULL,
      "phone" text NOT NULL,
      "email" text NOT NULL,
      "city" text NOT NULL,
      "address" text NOT NULL,
      "tier" "agency"."AgencyTier" NOT NULL DEFAULT 'NORMAL',
      "suspendedAt" TIMESTAMP(3),
      "suspendReason" text,
      "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      CONSTRAINT "agency_profiles_pkey" PRIMARY KEY ("userId")
    )`);

    await queryRunner.query(`CREATE TABLE "agency"."agency_invoices" (
      "id" text NOT NULL,
      "agencyId" text NOT NULL,
      "invoiceNo" text NOT NULL,
      "issuedById" text NOT NULL,
      "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      "dueAt" TIMESTAMP(3) NOT NULL,
      "amountIrr" bigint NOT NULL,
      "status" "agency"."AgencyInvoiceStatus" NOT NULL DEFAULT 'UNPAID',
      "paidAt" TIMESTAMP(3),
      "descriptionFa" text,
      "bookingId" text,
      CONSTRAINT "agency_invoices_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "agency_invoices_invoiceNo_key" ON "agency"."agency_invoices" ("invoiceNo")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "agency_invoices_bookingId_key" ON "agency"."agency_invoices" ("bookingId")',
    );
    await queryRunner.query(
      'CREATE INDEX "agency_invoices_agencyId_status_idx" ON "agency"."agency_invoices" ("agencyId", "status")',
    );

    await queryRunner.query(`CREATE TABLE "agency"."agency_credit_requests" (
      "id" text NOT NULL,
      "agencyId" text NOT NULL,
      "requestedLimitIrr" bigint NOT NULL,
      "note" text,
      "status" "agency"."AgencyCreditRequestStatus" NOT NULL DEFAULT 'PENDING',
      "decidedById" text,
      "decidedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      CONSTRAINT "agency_credit_requests_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      'CREATE INDEX "agency_credit_requests_agencyId_status_idx" ON "agency"."agency_credit_requests" ("agencyId", "status")',
    );

    await queryRunner.query(`ALTER TABLE "agency"."agency_invoices"
      ADD CONSTRAINT "agency_invoices_agencyId_fkey"
      FOREIGN KEY ("agencyId") REFERENCES "agency"."agency_profiles"("userId")
      ON DELETE RESTRICT ON UPDATE CASCADE`);
    await queryRunner.query(`ALTER TABLE "agency"."agency_credit_requests"
      ADD CONSTRAINT "agency_credit_requests_agencyId_fkey"
      FOREIGN KEY ("agencyId") REFERENCES "agency"."agency_profiles"("userId")
      ON DELETE RESTRICT ON UPDATE CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP SCHEMA IF EXISTS "agency" CASCADE');
  }
}
