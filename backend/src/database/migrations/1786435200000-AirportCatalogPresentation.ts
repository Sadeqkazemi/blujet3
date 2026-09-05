import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AirportCatalogPresentation1786435200000
  implements MigrationInterface
{
  name = 'AirportCatalogPresentation1786435200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "airports" ADD COLUMN IF NOT EXISTS "airportNameFa" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "airports" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "airports" DROP COLUMN IF EXISTS "active"`,
    );
    await queryRunner.query(
      `ALTER TABLE "airports" DROP COLUMN IF EXISTS "airportNameFa"`,
    );
  }
}
