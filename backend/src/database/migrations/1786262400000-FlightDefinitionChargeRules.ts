import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Flight definition workflow, COMFORT cabin, charge rules, proposal reject,
 * and booking charge snapshots. Additive / reversible; does not delete data.
 */
export class FlightDefinitionChargeRules1786262400000 implements MigrationInterface {
  name = 'FlightDefinitionChargeRules1786262400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."CabinClass" ADD VALUE IF NOT EXISTS 'COMFORT'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."PricingProposalStatus" ADD VALUE IF NOT EXISTS 'REJECTED'`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."FlightDefinitionStatus" AS ENUM('DRAFT', 'PENDING_CEO', 'APPROVED', 'REJECTED', 'PENDING_REVISION')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ChargeCalculationMode" AS ENUM('FIXED', 'PERCENTAGE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ChargeKind" AS ENUM('TAX', 'FEE')`,
    );

    await queryRunner.query(
      `ALTER TABLE "flight_instances" ADD COLUMN IF NOT EXISTS "durationMinutes" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" ADD COLUMN IF NOT EXISTS "competitorPriceIrr" bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" ADD COLUMN IF NOT EXISTS "cabinCapacities" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" ADD COLUMN IF NOT EXISTS "definitionStatus" "public"."FlightDefinitionStatus" NOT NULL DEFAULT 'APPROVED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" ADD COLUMN IF NOT EXISTS "rejectionReason" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" ADD COLUMN IF NOT EXISTS "approvedSnapshot" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" ADD COLUMN IF NOT EXISTS "pendingRevisionSnapshot" jsonb`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "flight_instances_definitionStatus_idx" ON "flight_instances" ("definitionStatus")`,
    );

    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" ADD COLUMN IF NOT EXISTS "rejectionReason" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" ADD COLUMN IF NOT EXISTS "rejectedById" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" ADD CONSTRAINT "fare_pricing_proposals_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "chargeSnapshot" jsonb`,
    );

    await queryRunner.query(`
      CREATE TABLE "flight_charge_rules" (
        "id" text NOT NULL,
        "flightInstanceId" text NOT NULL,
        "title" text NOT NULL,
        "kind" "public"."ChargeKind" NOT NULL,
        "calculationMode" "public"."ChargeCalculationMode" NOT NULL,
        "fixedAmountIrr" bigint,
        "percentageBasisPoints" integer,
        "cabin" "public"."CabinClass",
        "effectiveFrom" TIMESTAMP(3),
        "effectiveTo" TIMESTAMP(3),
        "isActive" boolean NOT NULL DEFAULT true,
        "isPendingRevision" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "flight_charge_rules_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "flight_charge_rules_flightInstanceId_fkey"
          FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "flight_charge_rules_flightInstanceId_idx" ON "flight_charge_rules" ("flightInstanceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "flight_charge_rules_active_idx" ON "flight_charge_rules" ("flightInstanceId", "isActive", "isPendingRevision")`,
    );

    // Backfill durationMinutes from existing arrival/departure where possible.
    await queryRunner.query(`
      UPDATE "flight_instances"
      SET "durationMinutes" = GREATEST(
        1,
        ROUND(EXTRACT(EPOCH FROM ("arrivalAt" - "departureAt")) / 60)::integer
      )
      WHERE "durationMinutes" IS NULL
        AND "arrivalAt" > "departureAt"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "flight_charge_rules"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."ChargeCalculationMode"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."ChargeKind"`);

    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN IF EXISTS "chargeSnapshot"`,
    );

    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" DROP CONSTRAINT IF EXISTS "fare_pricing_proposals_rejectedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" DROP COLUMN IF EXISTS "rejectedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" DROP COLUMN IF EXISTS "rejectedById"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" DROP COLUMN IF EXISTS "rejectionReason"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "flight_instances_definitionStatus_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN IF EXISTS "pendingRevisionSnapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN IF EXISTS "approvedSnapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN IF EXISTS "rejectionReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN IF EXISTS "definitionStatus"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN IF EXISTS "cabinCapacities"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN IF EXISTS "competitorPriceIrr"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN IF EXISTS "durationMinutes"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."FlightDefinitionStatus"`,
    );

    // CabinClass.COMFORT and PricingProposalStatus.REJECTED cannot be removed
    // safely from PostgreSQL enums while dependent rows may exist.
  }
}
