import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoyaltyDatabase1793088060000 implements MigrationInterface {
  public readonly name = 'CreateLoyaltyDatabase1793088060000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA IF NOT EXISTS "loyalty"');
    await queryRunner.query(
      `CREATE TYPE "loyalty"."ClubTier" AS ENUM('SILVER', 'GOLD', 'PLATINUM')`,
    );
    await queryRunner.query(
      `CREATE TYPE "loyalty"."ClubCardStatus" AS ENUM('NONE', 'REVIEW', 'ISSUED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "loyalty"."ClubCardRequestStatus" AS ENUM('SUBMITTED', 'REFERRED', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "loyalty"."ClubCardAssignee" AS ENUM('SENIOR', 'CHAIR')`,
    );
    await queryRunner.query(
      `CREATE TYPE "loyalty"."ClubPointsEntryType" AS ENUM('EARN', 'REDEEM', 'ADJUST')`,
    );
    await queryRunner.query(
      `CREATE TYPE "loyalty"."PriceLockStatus" AS ENUM('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "loyalty"."CabinClass" AS ENUM('ECONOMY', 'BUSINESS', 'COMFORT', 'FIRST')`,
    );
    await queryRunner.query(
      `CREATE TYPE "loyalty"."CustomerReferralStatus" AS ENUM('SIGNED_UP', 'BOOKED', 'REWARDED')`,
    );

    await queryRunner.query(`CREATE TABLE "loyalty"."club_members" (
      "id" text NOT NULL,
      "userId" text,
      "fullName" text NOT NULL,
      "email" text NOT NULL,
      "birthDate" TIMESTAMP(3),
      "nationalIdEnc" text NOT NULL,
      "nationalIdHash" text NOT NULL,
      "joinDate" TIMESTAMP(3) NOT NULL DEFAULT now(),
      "points" integer NOT NULL DEFAULT 0,
      "level" "loyalty"."ClubTier" NOT NULL DEFAULT 'SILVER',
      "cardStatus" "loyalty"."ClubCardStatus" NOT NULL DEFAULT 'NONE',
      "cardNo" text,
      "issuedByLabelFa" text,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      "deactivatedAt" TIMESTAMP(3),
      "deactivatedById" text,
      CONSTRAINT "club_members_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "club_members_userId_key" ON "loyalty"."club_members" ("userId")',
    );
    await queryRunner.query(
      'CREATE INDEX "club_members_nationalIdHash_idx" ON "loyalty"."club_members" ("nationalIdHash")',
    );
    await queryRunner.query(
      'CREATE INDEX "club_members_level_idx" ON "loyalty"."club_members" ("level")',
    );
    await queryRunner.query(
      'CREATE INDEX "club_members_deactivatedAt_idx" ON "loyalty"."club_members" ("deactivatedAt")',
    );

    await queryRunner.query(`CREATE TABLE "loyalty"."club_points_entries" (
      "id" text NOT NULL,
      "clubMemberId" text NOT NULL,
      "type" "loyalty"."ClubPointsEntryType" NOT NULL,
      "signedPoints" integer NOT NULL,
      "bookingId" text,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      CONSTRAINT "club_points_entries_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      'CREATE INDEX "club_points_entries_clubMemberId_idx" ON "loyalty"."club_points_entries" ("clubMemberId")',
    );

    await queryRunner.query(`CREATE TABLE "loyalty"."club_card_requests" (
      "id" text NOT NULL,
      "memberId" text NOT NULL,
      "level" "loyalty"."ClubTier" NOT NULL,
      "points" integer NOT NULL,
      "status" "loyalty"."ClubCardRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
      "assignedTo" "loyalty"."ClubCardAssignee",
      "decidedById" text,
      "decidedAt" TIMESTAMP(3),
      "cardNo" text,
      "history" jsonb NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      CONSTRAINT "club_card_requests_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      'CREATE INDEX "club_card_requests_status_idx" ON "loyalty"."club_card_requests" ("status")',
    );

    await queryRunner.query(`CREATE TABLE "loyalty"."club_tier_rules" (
      "id" text NOT NULL,
      "goldMinPoints" integer NOT NULL DEFAULT 5000,
      "platinumMinPoints" integer NOT NULL DEFAULT 15000,
      "cardRequestMinPoints" integer NOT NULL DEFAULT 5000,
      "updatedById" text,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      CONSTRAINT "club_tier_rules_pkey" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE TABLE "loyalty"."price_locks" (
      "id" text NOT NULL,
      "userId" text NOT NULL,
      "flightInstanceId" text NOT NULL,
      "cabin" "loyalty"."CabinClass" NOT NULL,
      "lockedPriceIrr" bigint NOT NULL,
      "feeIrr" bigint NOT NULL,
      "feeCharged" boolean NOT NULL DEFAULT false,
      "status" "loyalty"."PriceLockStatus" NOT NULL DEFAULT 'ACTIVE',
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      "bookingId" text,
      CONSTRAINT "price_locks_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      'CREATE INDEX "price_locks_userId_status_idx" ON "loyalty"."price_locks" ("userId", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX "price_locks_flightInstanceId_cabin_status_idx" ON "loyalty"."price_locks" ("flightInstanceId", "cabin", "status")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "price_locks_bookingId_key" ON "loyalty"."price_locks" ("bookingId")',
    );

    await queryRunner.query(`CREATE TABLE "loyalty"."customer_referrals" (
      "id" text NOT NULL,
      "referrerUserId" text NOT NULL,
      "referredUserId" text NOT NULL,
      "status" "loyalty"."CustomerReferralStatus" NOT NULL DEFAULT 'SIGNED_UP',
      "pointsAwarded" integer NOT NULL DEFAULT 0,
      "firstBookingId" text,
      "rewardedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "customer_referrals_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "customer_referrals_referredUserId_key" ON "loyalty"."customer_referrals" ("referredUserId")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "customer_referrals_firstBookingId_key" ON "loyalty"."customer_referrals" ("firstBookingId")',
    );
    await queryRunner.query(
      'CREATE INDEX "customer_referrals_referrerUserId_createdAt_idx" ON "loyalty"."customer_referrals" ("referrerUserId", "createdAt")',
    );

    await queryRunner.query(`ALTER TABLE "loyalty"."club_points_entries"
      ADD CONSTRAINT "club_points_entries_clubMemberId_fkey"
      FOREIGN KEY ("clubMemberId") REFERENCES "loyalty"."club_members"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE`);
    await queryRunner.query(`ALTER TABLE "loyalty"."club_card_requests"
      ADD CONSTRAINT "club_card_requests_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "loyalty"."club_members"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP SCHEMA IF EXISTS "loyalty" CASCADE');
  }
}
