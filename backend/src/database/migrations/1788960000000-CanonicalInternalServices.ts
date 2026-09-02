import type { MigrationInterface, QueryRunner } from 'typeorm';

const SERVICES = [
  ['search', 'موتور جستجوی پرواز', 99.99],
  ['payment', 'درگاه پرداخت بانکی', 99.95],
  ['api', 'وب‌سرویس API آژانس‌ها', 99.9],
  ['sms', 'سامانه پیامک (SMS)', 99.8],
  ['email', 'سرویس ایمیل', 99.99],
  ['club', 'باشگاه مشتریان', 100],
  ['charter', 'فروش چارتر', 99.7],
  ['refund', 'استرداد آنلاین', 98.2],
  ['checkin', 'چک‌این آنلاین', 99.6],
  ['cdn', 'CDN و تصاویر', 100],
  ['dest', 'نقشه و مقاصد', 99.99],
  ['mobile', 'اپلیکیشن موبایل (API)', 99.85],
] as const;

/** Canonical operational-service definitions are reference data required by
 * the IT panel in every environment. This migration deliberately preserves
 * operator-controlled enabled/uptime values for existing rows. */
export class CanonicalInternalServices1788960000000 implements MigrationInterface {
  name = 'CanonicalInternalServices1788960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [key, nameFa, uptimePct] of SERVICES) {
      await queryRunner.query(
        `INSERT INTO "internal_services"
          ("id", "key", "nameFa", "enabled", "uptimePct", "updatedAt")
         VALUES ($1, $2, $3, true, $4, CURRENT_TIMESTAMP)
         ON CONFLICT ("key") DO UPDATE SET "nameFa" = EXCLUDED."nameFa"`,
        [`canonical-internal-service-${key}`, key, nameFa, uptimePct],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "internal_services" WHERE "id" LIKE 'canonical-internal-service-%'`,
    );
  }
}
