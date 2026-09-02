import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommercialPanelSettings1787817600000 implements MigrationInterface {
  name = 'CommercialPanelSettings1787817600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "flight_instances" ADD "commercialPanelSettings" jsonb`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN "commercialPanelSettings"`,
    );
  }
}
