import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reconciles flight-approval foreign keys for databases that ran an earlier
 * revision of the workflow migration before these constraints were added.
 */
export class ReconcileFlightApprovalForeignKeys1788249600000 implements MigrationInterface {
  name = 'ReconcileFlightApprovalForeignKeys1788249600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        DROP CONSTRAINT IF EXISTS "flight_instances_publishedByUserId_fkey"
    `);
    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        ADD CONSTRAINT "flight_instances_publishedByUserId_fkey"
        FOREIGN KEY ("publishedByUserId") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE NOT VALID
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM "flight_instances" instance
          LEFT JOIN "users" publisher ON publisher."id" = instance."publishedByUserId"
          WHERE instance."publishedByUserId" IS NOT NULL AND publisher."id" IS NULL
        ) THEN
          ALTER TABLE "flight_instances"
            VALIDATE CONSTRAINT "flight_instances_publishedByUserId_fkey";
        END IF;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "flight_reviews"
        DROP CONSTRAINT IF EXISTS "flight_reviews_flightInstanceId_fkey"
    `);
    await queryRunner.query(`
      ALTER TABLE "flight_reviews"
        ADD CONSTRAINT "flight_reviews_flightInstanceId_fkey"
        FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM "flight_reviews" review
          LEFT JOIN "flight_instances" instance ON instance."id" = review."flightInstanceId"
          WHERE instance."id" IS NULL
        ) THEN
          ALTER TABLE "flight_reviews"
            VALIDATE CONSTRAINT "flight_reviews_flightInstanceId_fkey";
        END IF;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "flight_reviews"
        DROP CONSTRAINT IF EXISTS "flight_reviews_reviewedByUserId_fkey"
    `);
    await queryRunner.query(`
      ALTER TABLE "flight_reviews"
        ADD CONSTRAINT "flight_reviews_reviewedByUserId_fkey"
        FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM "flight_reviews" review
          LEFT JOIN "users" reviewer ON reviewer."id" = review."reviewedByUserId"
          WHERE reviewer."id" IS NULL
        ) THEN
          ALTER TABLE "flight_reviews"
            VALIDATE CONSTRAINT "flight_reviews_reviewedByUserId_fkey";
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "flight_reviews"
        DROP CONSTRAINT IF EXISTS "flight_reviews_reviewedByUserId_fkey"
    `);
    await queryRunner.query(`
      ALTER TABLE "flight_reviews"
        DROP CONSTRAINT IF EXISTS "flight_reviews_flightInstanceId_fkey"
    `);
    await queryRunner.query(`
      ALTER TABLE "flight_instances"
        DROP CONSTRAINT IF EXISTS "flight_instances_publishedByUserId_fkey"
    `);
  }
}
