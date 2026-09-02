import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTravelExtraSettings1786250000000 implements MigrationInterface {
  name = 'AddTravelExtraSettings1786250000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "travel_extra_settings" (
        "id" text NOT NULL,
        "code" text NOT NULL,
        "titleFa" text NOT NULL,
        "titleEn" text,
        "titleAr" text,
        "descriptionFa" text,
        "billingUnit" text NOT NULL,
        "priceIrr" bigint NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "purchaseEnabled" boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "updatedById" text,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        CONSTRAINT "travel_extra_settings_pkey" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "travel_extra_settings_code_key" ON "travel_extra_settings" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "travel_extra_settings_active_sortOrder_idx" ON "travel_extra_settings" ("active", "sortOrder")`,
    );
    await queryRunner.query(
      `ALTER TABLE "travel_extra_settings" ADD CONSTRAINT "travel_extra_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "extrasSnapshot" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "extrasIrr" bigint NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "extrasIrr"`);
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "extrasSnapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "travel_extra_settings" DROP CONSTRAINT "travel_extra_settings_updatedById_fkey"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."travel_extra_settings_active_sortOrder_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."travel_extra_settings_code_key"`,
    );
    await queryRunner.query(`DROP TABLE "travel_extra_settings"`);
  }
}
