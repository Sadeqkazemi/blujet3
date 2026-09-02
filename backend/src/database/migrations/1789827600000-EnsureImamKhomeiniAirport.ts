import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureImamKhomeiniAirport1789827600000
  implements MigrationInterface
{
  name = 'EnsureImamKhomeiniAirport1789827600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "airports"
        ("id", "code", "cityFa", "airportNameFa", "tz", "minConnectMin", "active", "isInternational")
      VALUES
        ('00000000-0000-4000-8000-000000000ika', 'IKA', 'تهران', 'فرودگاه بین‌المللی امام خمینی', 'Asia/Tehran', 90, true, false)
      ON CONFLICT ("code") DO UPDATE SET
        "cityFa" = EXCLUDED."cityFa",
        "airportNameFa" = EXCLUDED."airportNameFa",
        "tz" = EXCLUDED."tz",
        "active" = true,
        "isInternational" = false
    `);
  }

  async down(): Promise<void> {
    // Reference airport rows are retained on rollback to protect historical routes.
  }
}
