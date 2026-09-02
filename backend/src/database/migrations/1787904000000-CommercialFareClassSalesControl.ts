import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommercialFareClassSalesControl1787904000000 implements MigrationInterface {
  name = 'CommercialFareClassSalesControl1787904000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "flight_instances" ADD COLUMN "publicSaleEnabled" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ADD COLUMN "sitePriceIrr" bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ADD COLUMN "agencySeatsReleased" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ADD COLUMN "agencyReleasePriceIrr" bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ADD COLUMN "agencySpecialOffer" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" ADD COLUMN "ceoNote" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" ADD COLUMN "operationsNote" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" ADD COLUMN "commercialNote" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" DROP COLUMN "commercialNote"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" DROP COLUMN "operationsNote"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" DROP COLUMN "ceoNote"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" DROP COLUMN "agencySpecialOffer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" DROP COLUMN "agencyReleasePriceIrr"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" DROP COLUMN "agencySeatsReleased"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" DROP COLUMN "sitePriceIrr"`,
    );
    await queryRunner.query(
      `ALTER TABLE "flight_instances" DROP COLUMN "publicSaleEnabled"`,
    );
  }
}
