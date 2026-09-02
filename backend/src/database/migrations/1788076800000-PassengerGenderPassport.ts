import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persist checkout gender + passport on booking passengers (parity with
 * SavedPassenger / checkout form fields that were previously UI-only).
 */
export class PassengerGenderPassport1788076800000 implements MigrationInterface {
  name = 'PassengerGenderPassport1788076800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "passengers"
        ADD COLUMN IF NOT EXISTS "gender" text,
        ADD COLUMN IF NOT EXISTS "passportNoEnc" text
    `);
    await queryRunner.query(`
      ALTER TABLE "passengers"
        DROP CONSTRAINT IF EXISTS "passengers_gender_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "passengers"
        ADD CONSTRAINT "passengers_gender_check"
        CHECK ("gender" IS NULL OR "gender" IN ('male', 'female'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "passengers"
        DROP CONSTRAINT IF EXISTS "passengers_gender_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "passengers"
        DROP COLUMN IF EXISTS "gender",
        DROP COLUMN IF EXISTS "passportNoEnc"
    `);
  }
}
