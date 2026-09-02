import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Checkout autofill needs gender + birthDate on saved passengers so selecting
 * a stored passenger can fill every passenger-form field.
 */
export class SavedPassengerGenderBirthDate1787990400000 implements MigrationInterface {
  name = 'SavedPassengerGenderBirthDate1787990400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "saved_passengers"
        ADD COLUMN IF NOT EXISTS "gender" text,
        ADD COLUMN IF NOT EXISTS "birthDate" date
    `);
    await queryRunner.query(`
      ALTER TABLE "saved_passengers"
        DROP CONSTRAINT IF EXISTS "saved_passengers_gender_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "saved_passengers"
        ADD CONSTRAINT "saved_passengers_gender_check"
        CHECK ("gender" IS NULL OR "gender" IN ('male', 'female'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "saved_passengers"
        DROP CONSTRAINT IF EXISTS "saved_passengers_gender_check"
    `);
    await queryRunner.query(`
      ALTER TABLE "saved_passengers"
        DROP COLUMN IF EXISTS "birthDate",
        DROP COLUMN IF EXISTS "gender"
    `);
  }
}
