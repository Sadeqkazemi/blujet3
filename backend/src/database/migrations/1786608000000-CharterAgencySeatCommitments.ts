import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-cabin capacity-commitment records: CharterCommitment (charter has no
 * pre-existing entity — charterSeats on flight_instances was a flat int
 * with no owning row) and AgencySeatCommitment (the capacity/financial
 * declaration layer, distinct from the pre-existing agency_allotments
 * table that continues to drive actual per-ticket agency-channel booking).
 * Additive / reversible; does not touch flight_instances, agency_allotments,
 * or any other existing table's data.
 */
export class CharterAgencySeatCommitments1786608000000 implements MigrationInterface {
  name = 'CharterAgencySeatCommitments1786608000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."LedgerEntryType" ADD VALUE IF NOT EXISTS 'COMMITMENT'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."CommitmentStatus" AS ENUM('ACTIVE', 'CANCELLED')`,
    );

    // flightInstanceId/agencyId/createdById/cancelledById are plain
    // (relation-less) columns on CharterCommitment/AgencySeatCommitment
    // (documented TS2589-avoidance in the entity files), so — same
    // schema-parity reasoning as the aircraft-catalog migration — no
    // DB-level FK constraint is added for them; schema-parity.e2e-spec.ts
    // derives its expected schema purely from entity relation metadata.
    await queryRunner.query(`
      CREATE TABLE "charter_commitments" (
        "id" text NOT NULL,
        "flightInstanceId" text NOT NULL,
        "cabin" "public"."CabinClass" NOT NULL,
        "seats" integer NOT NULL,
        "amountIrr" bigint NOT NULL,
        "periodStart" TIMESTAMP(3),
        "periodEnd" TIMESTAMP(3),
        "status" "public"."CommitmentStatus" NOT NULL DEFAULT 'ACTIVE',
        "idempotencyKey" text,
        "createdById" text NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL,
        "cancelledById" text,
        "cancelledAt" TIMESTAMP(3),
        CONSTRAINT "charter_commitments_pkey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "charter_commitments_flightInstanceId_cabin_idx" ON "charter_commitments" ("flightInstanceId", "cabin")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "charter_commitments_idempotencyKey_key" ON "charter_commitments" ("idempotencyKey")`,
    );

    await queryRunner.query(`
      CREATE TABLE "agency_seat_commitments" (
        "id" text NOT NULL,
        "flightInstanceId" text NOT NULL,
        "agencyId" text NOT NULL,
        "cabin" "public"."CabinClass" NOT NULL,
        "seats" integer NOT NULL,
        "amountIrr" bigint NOT NULL,
        "periodStart" TIMESTAMP(3),
        "periodEnd" TIMESTAMP(3),
        "status" "public"."CommitmentStatus" NOT NULL DEFAULT 'ACTIVE',
        "idempotencyKey" text,
        "createdById" text NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL,
        "cancelledById" text,
        "cancelledAt" TIMESTAMP(3),
        CONSTRAINT "agency_seat_commitments_pkey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "agency_seat_commitments_flightInstanceId_cabin_idx" ON "agency_seat_commitments" ("flightInstanceId", "cabin")`,
    );
    await queryRunner.query(
      `CREATE INDEX "agency_seat_commitments_agencyId_idx" ON "agency_seat_commitments" ("agencyId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "agency_seat_commitments_idempotencyKey_key" ON "agency_seat_commitments" ("idempotencyKey")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "agency_seat_commitments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "charter_commitments"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."CommitmentStatus"`);
    // The 'COMMITMENT' LedgerEntryType enum value cannot be removed
    // (Postgres limitation, same documented convention as every other
    // enum-VALUE addition in this codebase) — harmless no-op once no row
    // references it.
  }
}
