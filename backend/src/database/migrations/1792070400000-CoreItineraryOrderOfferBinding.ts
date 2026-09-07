import { MigrationInterface, QueryRunner } from 'typeorm';

export class CoreItineraryOrderOfferBinding1792070400000 implements MigrationInterface {
  name = 'CoreItineraryOrderOfferBinding1792070400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "orders"."core_itinerary_orders" ADD "sourceOfferId" text',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "core_itinerary_orders_sourceOfferId_key" ON "orders"."core_itinerary_orders" ("sourceOfferId") WHERE "sourceOfferId" IS NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "orders"."core_itinerary_orders_sourceOfferId_key"',
    );
    await queryRunner.query(
      'ALTER TABLE "orders"."core_itinerary_orders" DROP COLUMN "sourceOfferId"',
    );
  }
}
