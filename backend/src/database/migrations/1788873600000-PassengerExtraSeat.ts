import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PassengerExtraSeat1788873600000 implements MigrationInterface {
  name = 'PassengerExtraSeat1788873600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "passengers" ADD COLUMN "extraSeatCode" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "passengers" ADD COLUMN "extraSeatFareIrr" bigint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "passengers" DROP COLUMN "extraSeatFareIrr"`,
    );
    await queryRunner.query(
      `ALTER TABLE "passengers" DROP COLUMN "extraSeatCode"`,
    );
  }
}
