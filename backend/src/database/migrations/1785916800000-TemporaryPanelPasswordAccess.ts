import { MigrationInterface, QueryRunner } from 'typeorm';

export class TemporaryPanelPasswordAccess1785916800000 implements MigrationInterface {
  name = 'TemporaryPanelPasswordAccess1785916800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "temporaryPasswordOnlyUntil" TIMESTAMP(3)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "temporaryPasswordOnlyUntil"`,
    );
  }
}
