import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Add encrypted customer address and make the two fixed checkout rules durable. */
export class CustomerAddressAndFixedAncillaries1788691200000
  implements MigrationInterface
{
  name = 'CustomerAddressAndFixedAncillaries1788691200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "addressEnc" text
    `);
    await queryRunner.query(`
      UPDATE "ancillary_services"
      SET "enabled" = true, "updatedAt" = now()
      WHERE "key" IN ('seat-selection', 'pet')
    `);
    await queryRunner.query(`
      INSERT INTO "travel_extra_settings"
        ("id", "code", "titleFa", "titleEn", "titleAr", "descriptionFa",
         "billingUnit", "priceIrr", "active", "purchaseEnabled", "sortOrder",
         "updatedById", "createdAt", "updatedAt")
      SELECT
        '00000000-0000-4000-8000-00000000000a',
        'PET',
        'حمل حیوان خانگی',
        'Pet travel',
        'سفر الحيوانات',
        'حمل حیوان خانگی در کابین یا انبار',
        'PER_BOOKING',
        COALESCE((SELECT "priceIrr" FROM "ancillary_services" WHERE "key" = 'pet'), 2500000),
        true,
        true,
        80,
        NULL,
        now(),
        now()
      WHERE NOT EXISTS (
        SELECT 1 FROM "travel_extra_settings" WHERE "code" = 'PET'
      )
    `);
    await queryRunner.query(`
      UPDATE "travel_extra_settings" t
      SET
        "active" = true,
        "purchaseEnabled" = true,
        "priceIrr" = a."priceIrr",
        "updatedAt" = now()
      FROM "ancillary_services" a
      WHERE a."key" = 'pet' AND t."code" = 'PET'
    `);
    await queryRunner.query(`
      UPDATE "travel_extra_settings"
      SET "active" = true, "purchaseEnabled" = true, "updatedAt" = now()
      WHERE "code" = 'SEAT_SELECTION'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Keep the fixed service row on rollback; it can predate this migration.
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "addressEnc"`);
  }
}
