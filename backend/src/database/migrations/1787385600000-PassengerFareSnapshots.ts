import { MigrationInterface, QueryRunner } from 'typeorm';

export class PassengerFareSnapshots1787385600000 implements MigrationInterface {
  name = 'PassengerFareSnapshots1787385600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "passengers" ADD "passengerType" text NOT NULL DEFAULT 'ADULT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "passengers" ADD "birthDate" date NOT NULL DEFAULT '1970-01-01'`,
    );
    await queryRunner.query(
      `ALTER TABLE "passengers" ADD "occupiesSeat" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "passengers" ADD "fareIrr" bigint NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "passengers" ADD "taxIrr" bigint NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "passengers" ADD CONSTRAINT "passengers_passengerType_check" CHECK ("passengerType" IN ('ADULT','CHILD','INFANT'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "passengers" DROP CONSTRAINT "passengers_passengerType_check"`,
    );
    await queryRunner.query(`ALTER TABLE "passengers" DROP COLUMN "taxIrr"`);
    await queryRunner.query(`ALTER TABLE "passengers" DROP COLUMN "fareIrr"`);
    await queryRunner.query(
      `ALTER TABLE "passengers" DROP COLUMN "occupiesSeat"`,
    );
    await queryRunner.query(`ALTER TABLE "passengers" DROP COLUMN "birthDate"`);
    await queryRunner.query(
      `ALTER TABLE "passengers" DROP COLUMN "passengerType"`,
    );
  }
}
