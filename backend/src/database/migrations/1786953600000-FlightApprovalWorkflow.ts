import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Flight approval workflow:
 * - Role.OPERATIONS_MANAGER
 * - definitionStatus: PENDING_OPERATIONS, OPERATIONS_REJECTED, PUBLISHED
 * - Data migrate APPROVED → PUBLISHED (no deletes)
 * - FlightInstance.version / publishedAt / publishedByUserId
 * - flight_reviews append-only table
 *
 * Before/after counts for definitionStatus are logged via NOTICE.
 */
export class FlightApprovalWorkflow1786953600000 implements MigrationInterface {
  name = 'FlightApprovalWorkflow1786953600000';

  /**
   * Must run outside a wrapping transaction: Postgres rejects using a newly
   * ADD VALUE'd enum label until that ADD VALUE is committed (55P04).
   * Requires dataSourceOptions.migrationsTransactionMode = 'each'.
   */
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        RAISE NOTICE 'flight_instances definitionStatus BEFORE migration:';
        FOR r IN
          SELECT "definitionStatus"::text AS st, COUNT(*)::int AS cnt
          FROM flight_instances
          GROUP BY 1
          ORDER BY 1
        LOOP
          RAISE NOTICE '  % = %', r.st, r.cnt;
        END LOOP;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TYPE "public"."Role" ADD VALUE IF NOT EXISTS 'OPERATIONS_MANAGER'`,
    );

    await queryRunner.query(
      `ALTER TYPE "public"."FlightDefinitionStatus" ADD VALUE IF NOT EXISTS 'PENDING_OPERATIONS'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."FlightDefinitionStatus" ADD VALUE IF NOT EXISTS 'OPERATIONS_REJECTED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."FlightDefinitionStatus" ADD VALUE IF NOT EXISTS 'PUBLISHED'`,
    );

    // New enum labels cannot be used in the same transaction they are added
    // on some PG versions — commit boundary via separate statements is enough
    // when TypeORM runs each query separately.

    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3)
    `);
    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        ADD COLUMN IF NOT EXISTS "publishedByUserId" text
    `);
    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        ADD CONSTRAINT "flight_instances_publishedByUserId_fkey"
        FOREIGN KEY ("publishedByUserId") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
    `);

    await queryRunner.query(`
      UPDATE "flight_instances"
      SET "definitionStatus" = 'PUBLISHED'::"public"."FlightDefinitionStatus",
          "publishedAt" = COALESCE("publishedAt", CURRENT_TIMESTAMP)
      WHERE "definitionStatus" = 'APPROVED'::"public"."FlightDefinitionStatus"
    `);

    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        ALTER COLUMN "definitionStatus"
        SET DEFAULT 'PUBLISHED'::"public"."FlightDefinitionStatus"
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."FlightReviewStage" AS ENUM('OPERATIONS', 'CEO');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."FlightReviewDecision" AS ENUM('APPROVED', 'REJECTED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "flight_reviews" (
        "id" text NOT NULL,
        "flightInstanceId" text NOT NULL,
        "stage" "public"."FlightReviewStage" NOT NULL,
        "decision" "public"."FlightReviewDecision" NOT NULL,
        "comment" text NOT NULL,
        "reviewedByUserId" text NOT NULL,
        "reviewedAt" TIMESTAMP(3) NOT NULL,
        "expectedVersion" integer,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "flight_reviews_pkey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "flight_reviews_flightInstanceId_reviewedAt_idx"
      ON "flight_reviews" ("flightInstanceId", "reviewedAt")
    `);
    await queryRunner.query(`
      ALTER TABLE "flight_reviews"
        ADD CONSTRAINT "flight_reviews_flightInstanceId_fkey"
        FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "flight_reviews"
        ADD CONSTRAINT "flight_reviews_reviewedByUserId_fkey"
        FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        RAISE NOTICE 'flight_instances definitionStatus AFTER migration:';
        FOR r IN
          SELECT "definitionStatus"::text AS st, COUNT(*)::int AS cnt
          FROM flight_instances
          GROUP BY 1
          ORDER BY 1
        LOOP
          RAISE NOTICE '  % = %', r.st, r.cnt;
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "flight_reviews"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."FlightReviewDecision"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."FlightReviewStage"`);

    await queryRunner.query(`
      UPDATE "flight_instances"
      SET "definitionStatus" = 'APPROVED'::"public"."FlightDefinitionStatus"
      WHERE "definitionStatus" = 'PUBLISHED'::"public"."FlightDefinitionStatus"
    `);
    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        ALTER COLUMN "definitionStatus"
        SET DEFAULT 'APPROVED'::"public"."FlightDefinitionStatus"
    `);

    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP CONSTRAINT IF EXISTS "flight_instances_publishedByUserId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN IF EXISTS "publishedByUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN IF EXISTS "publishedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN IF EXISTS "version"`,
    );

    // Postgres cannot remove enum values safely — leave Role /
    // FlightDefinitionStatus additions in place on down.
  }
}
