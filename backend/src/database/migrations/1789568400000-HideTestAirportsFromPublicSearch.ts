import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Test fixtures created during UAT must not appear in customer-facing airport
 * pickers. Deactivation preserves historical foreign keys and audit records.
 */
export class HideTestAirportsFromPublicSearch1789568400000 implements MigrationInterface {
  name = 'HideTestAirportsFromPublicSearch1789568400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "airports"
      SET "active" = false
      WHERE trim("cityFa") ~ '^شهر[[:space:]]*(تست|آزمایش)'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "airports"
      SET "active" = true
      WHERE trim("cityFa") ~ '^شهر[[:space:]]*(تست|آزمایش)'
    `);
  }
}
