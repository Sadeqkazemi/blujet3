import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AgencySalesVisibility1789737600000 implements MigrationInterface {
  name = 'AgencySalesVisibility1789737600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "flight_instances" ADD "agencySaleEnabled" boolean NOT NULL DEFAULT true`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN "agencySaleEnabled"`,
    );
  }
}
