import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * COMFORT physical seat-map columns + nullable competitor price on proposals.
 * Additive / reversible; does not delete existing seat-map or pricing data.
 */
export class ComfortSeatMapAndNullableCompetitor1786348800000 implements MigrationInterface {
  name = 'ComfortSeatMapAndNullableCompetitor1786348800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" ADD COLUMN IF NOT EXISTS "comfortRowStart" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" ADD COLUMN IF NOT EXISTS "comfortRowEnd" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" ADD COLUMN IF NOT EXISTS "comfortColsLeft" text[]`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" ADD COLUMN IF NOT EXISTS "comfortColsRight" text[]`,
    );

    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" ALTER COLUMN "competitorPriceIrr" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const nullCompetitors = (await queryRunner.query(
      `SELECT 1 FROM "fare_pricing_proposals" WHERE "competitorPriceIrr" IS NULL LIMIT 1`,
    )) as unknown[];
    if (nullCompetitors.length > 0) {
      throw new Error(
        'Cannot revert nullable competitor prices while null values exist.',
      );
    }
    await queryRunner.query(
      `ALTER TABLE "fare_pricing_proposals" ALTER COLUMN "competitorPriceIrr" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" DROP COLUMN IF EXISTS "comfortColsRight"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" DROP COLUMN IF EXISTS "comfortColsLeft"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" DROP COLUMN IF EXISTS "comfortRowEnd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" DROP COLUMN IF EXISTS "comfortRowStart"`,
    );
  }
}
