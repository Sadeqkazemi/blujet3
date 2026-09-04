import { MigrationInterface, QueryRunner } from 'typeorm';

export class CoreItineraryHoldLifecycle1791129600000 implements MigrationInterface {
  name = 'CoreItineraryHoldLifecycle1791129600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "orders"."core_itinerary_lifecycle_events" (
        "id" text NOT NULL,
        "orderId" text NOT NULL,
        "eventType" text NOT NULL,
        "fromStatus" text NOT NULL,
        "toStatus" text NOT NULL,
        "occurredAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "core_itinerary_lifecycle_events_transition_check" CHECK ("eventType" = 'HOLD_EXPIRED' AND "fromStatus" = 'HELD' AND "toStatus" = 'EXPIRED'),
        CONSTRAINT "core_itinerary_lifecycle_events_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "core_itinerary_lifecycle_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"."core_itinerary_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_lifecycle_events_order_event_key" ON "orders"."core_itinerary_lifecycle_events" ("orderId", "eventType")`,
    );
    await queryRunner.query(
      `CREATE INDEX "core_itinerary_lifecycle_events_occurredAt_idx" ON "orders"."core_itinerary_lifecycle_events" ("occurredAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE "orders"."core_itinerary_lifecycle_events"`,
    );
  }
}
