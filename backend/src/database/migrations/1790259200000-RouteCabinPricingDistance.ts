import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RouteCabinPricingDistance1790259200000 implements MigrationInterface {
  name = 'RouteCabinPricingDistance1790259200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aircraft_cabins" ADD COLUMN "defaultClassCode" text`,
    );
    await queryRunner.query(`
      UPDATE "aircraft_cabins"
      SET "defaultClassCode" = CASE "cabinType"::text
        WHEN 'FIRST' THEN 'F'
        WHEN 'BUSINESS' THEN 'C'
        WHEN 'COMFORT' THEN 'W'
        ELSE 'Y'
      END
    `);
    await queryRunner.query(
      `ALTER TABLE "aircraft_cabins" ALTER COLUMN "defaultClassCode" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_cabins" ADD CONSTRAINT "aircraft_cabins_defaultClassCode_check" CHECK ("defaultClassCode" ~ '^[A-Z0-9]{1,3}$')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "aircraft_cabins_aircraftDefinitionId_defaultClassCode_key" ON "aircraft_cabins" ("aircraftDefinitionId", "defaultClassCode")`,
    );
    await queryRunner.query(
      `ALTER TABLE "routes" ADD COLUMN "distanceKm" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "routes" ADD COLUMN "distanceSource" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_schedule_templates" ADD COLUMN "distanceKm" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_schedule_templates" ADD COLUMN "distanceSource" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "routes" ADD CONSTRAINT "routes_distanceKm_check" CHECK ("distanceKm" IS NULL OR "distanceKm" > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "routes" ADD CONSTRAINT "routes_distanceSource_check" CHECK ("distanceSource" IS NULL OR "distanceSource" IN ('AI', 'MANUAL'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_schedule_templates" ADD CONSTRAINT "flight_schedule_templates_distanceKm_check" CHECK ("distanceKm" IS NULL OR "distanceKm" > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_schedule_templates" ADD CONSTRAINT "flight_schedule_templates_distanceSource_check" CHECK ("distanceSource" IS NULL OR "distanceSource" IN ('AI', 'MANUAL'))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "flight_schedule_templates" DROP CONSTRAINT IF EXISTS "flight_schedule_templates_distanceSource_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_schedule_templates" DROP CONSTRAINT IF EXISTS "flight_schedule_templates_distanceKm_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_schedule_templates" DROP COLUMN IF EXISTS "distanceSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_schedule_templates" DROP COLUMN IF EXISTS "distanceKm"`,
    );
    await queryRunner.query(
      `ALTER TABLE "routes" DROP CONSTRAINT IF EXISTS "routes_distanceSource_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "routes" DROP CONSTRAINT IF EXISTS "routes_distanceKm_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "routes" DROP COLUMN IF EXISTS "distanceSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "routes" DROP COLUMN IF EXISTS "distanceKm"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "aircraft_cabins_aircraftDefinitionId_defaultClassCode_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_cabins" DROP CONSTRAINT IF EXISTS "aircraft_cabins_defaultClassCode_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_cabins" DROP COLUMN IF EXISTS "defaultClassCode"`,
    );
  }
}
