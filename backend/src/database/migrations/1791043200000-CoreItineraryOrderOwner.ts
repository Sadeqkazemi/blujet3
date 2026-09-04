import { MigrationInterface, QueryRunner } from 'typeorm';

export class CoreItineraryOrderOwner1791043200000 implements MigrationInterface {
  name = 'CoreItineraryOrderOwner1791043200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_orders" ADD CONSTRAINT "core_itinerary_orders_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_orders" DROP CONSTRAINT "core_itinerary_orders_ownerId_fkey"`,
    );
  }
}
