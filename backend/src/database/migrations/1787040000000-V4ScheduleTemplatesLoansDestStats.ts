import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * V4 backend gaps:
 * - flight_schedule_templates + flight_instances.scheduleTemplateId
 * - bank_loan_applications
 * - airports.isInternational (for destination stats)
 */
export class V4ScheduleTemplatesLoansDestStats1787040000000 implements MigrationInterface {
  name = 'V4ScheduleTemplatesLoansDestStats1787040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."FlightScheduleTemplateStatus" AS ENUM('ACTIVE', 'DEACTIVATED')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."BankLoanStatus" AS ENUM(
        'SUBMITTED', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED',
        'DISBURSED', 'CANCELLED', 'FAILED', 'UNKNOWN'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "airports"
        ADD COLUMN IF NOT EXISTS "isInternational" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      UPDATE "airports"
      SET "isInternational" = true
      WHERE "code" IN ('DXB', 'IST', 'NJF')
    `);

    await queryRunner.query(`
      CREATE TABLE "flight_schedule_templates" (
        "id" text NOT NULL,
        "originAirportId" text NOT NULL,
        "destinationAirportId" text NOT NULL,
        "flightNoBase" text NOT NULL,
        "aircraftDefinitionId" text NOT NULL,
        "departureTime" text NOT NULL,
        "durationMinutes" integer NOT NULL,
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "weekdays" jsonb NOT NULL,
        "agencyPriceIrr" bigint NOT NULL,
        "legalCeilingIrr" bigint NOT NULL,
        "cabinCapacities" jsonb NOT NULL,
        "status" "public"."FlightScheduleTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
        "idempotencyKey" text NOT NULL,
        "createdByUserId" text NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deactivatedAt" TIMESTAMP(3),
        CONSTRAINT "flight_schedule_templates_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "flight_schedule_templates_idempotencyKey_key" UNIQUE ("idempotencyKey"),
        CONSTRAINT "flight_schedule_templates_originAirportId_fkey"
          FOREIGN KEY ("originAirportId") REFERENCES "airports"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "flight_schedule_templates_destinationAirportId_fkey"
          FOREIGN KEY ("destinationAirportId") REFERENCES "airports"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "flight_schedule_templates_aircraftDefinitionId_fkey"
          FOREIGN KEY ("aircraftDefinitionId") REFERENCES "aircraft_definitions"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "flight_schedule_templates_createdByUserId_fkey"
          FOREIGN KEY ("createdByUserId") REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "flight_schedule_templates_status_idx"
      ON "flight_schedule_templates" ("status")
    `);

    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        ADD COLUMN IF NOT EXISTS "scheduleTemplateId" text
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "flight_instances_scheduleTemplateId_idx"
      ON "flight_instances" ("scheduleTemplateId")
    `);

    await queryRunner.query(`
      CREATE TABLE "bank_loan_applications" (
        "id" text NOT NULL,
        "userId" text NOT NULL,
        "idempotencyKey" text NOT NULL,
        "bankReferenceId" text,
        "requestedAmountIrr" bigint NOT NULL,
        "bankStatus" "public"."BankLoanStatus" NOT NULL DEFAULT 'SUBMITTED',
        "statusSummary" jsonb,
        "lastWebhookEventId" text,
        "lastSyncedAt" TIMESTAMP(3),
        "walletCreditReference" text,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "bank_loan_applications_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "bank_loan_applications_idempotencyKey_key" UNIQUE ("idempotencyKey"),
        CONSTRAINT "bank_loan_applications_bankReferenceId_key" UNIQUE ("bankReferenceId"),
        CONSTRAINT "bank_loan_applications_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "bank_loan_applications_userId_createdAt_idx"
      ON "bank_loan_applications" ("userId", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bank_loan_applications"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "flight_instances_scheduleTemplateId_idx"`,
    );
    await queryRunner.query(`
      ALTER TABLE "flight_instances" DROP COLUMN IF EXISTS "scheduleTemplateId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "flight_schedule_templates"`);
    await queryRunner.query(`
      ALTER TABLE "airports" DROP COLUMN IF EXISTS "isInternational"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."BankLoanStatus"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."FlightScheduleTemplateStatus"`,
    );
  }
}
