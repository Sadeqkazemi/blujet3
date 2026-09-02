import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgencyApiKeyPolicyFields1788518400000 implements MigrationInterface {
  name = 'AgencyApiKeyPolicyFields1788518400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."AgencyApiEnvironment" AS ENUM('SANDBOX', 'PRODUCTION')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AgencyFlightDomain" AS ENUM('ALL', 'DOMESTIC', 'INTERNATIONAL')`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_api_keys" ADD "capabilities" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_api_keys" ADD "environment" "public"."AgencyApiEnvironment" NOT NULL DEFAULT 'SANDBOX'`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_api_keys" ADD "flightDomain" "public"."AgencyFlightDomain" NOT NULL DEFAULT 'ALL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_api_keys" ADD "ipWhitelist" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_api_keys" ADD "rateLimitPerMinute" integer`,
    );

    // Backfill fine-grained capabilities from the legacy coarse scope.
    await queryRunner.query(`
      UPDATE "agency_api_keys"
      SET "capabilities" = CASE "scope"
        WHEN 'FULL' THEN ARRAY[
          'RESERVATION','TICKETING','PRICING','FLIGHT_INFO','REFUND','CHECK_IN','AVAILABILITY'
        ]
        WHEN 'SEARCH_BOOK' THEN ARRAY[
          'RESERVATION','TICKETING','FLIGHT_INFO','AVAILABILITY'
        ]
        ELSE ARRAY['FLIGHT_INFO','AVAILABILITY']
      END
    `);

    // One active/suspended key per agency+environment — revoke older duplicates
    // so the unique index can be created after every row defaults to SANDBOX.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY "agencyId"
                 ORDER BY "activatedAt" DESC
               ) AS rn
        FROM "agency_api_keys"
        WHERE "status" IN ('ACTIVE', 'SUSPENDED')
      )
      UPDATE "agency_api_keys" k
      SET "status" = 'REVOKED'
      FROM ranked r
      WHERE k.id = r.id AND r.rn > 1
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "agency_api_keys_agency_env_active_idx"
      ON "agency_api_keys" ("agencyId", "environment")
      WHERE "status" IN ('ACTIVE', 'SUSPENDED')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."agency_api_keys_agency_env_active_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_api_keys" DROP COLUMN "rateLimitPerMinute"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_api_keys" DROP COLUMN "ipWhitelist"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_api_keys" DROP COLUMN "flightDomain"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_api_keys" DROP COLUMN "environment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_api_keys" DROP COLUMN "capabilities"`,
    );
    await queryRunner.query(`DROP TYPE "public"."AgencyFlightDomain"`);
    await queryRunner.query(`DROP TYPE "public"."AgencyApiEnvironment"`);
  }
}
