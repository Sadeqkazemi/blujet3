import { MigrationInterface, QueryRunner } from 'typeorm';

export class CoreItineraryCancellationLifecycle1791216000000 implements MigrationInterface {
  name = 'CoreItineraryCancellationLifecycle1791216000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_lifecycle_events" DROP CONSTRAINT "core_itinerary_lifecycle_events_transition_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_lifecycle_events" ADD CONSTRAINT "core_itinerary_lifecycle_events_transition_check" CHECK (("eventType" = 'HOLD_EXPIRED' AND "fromStatus" = 'HELD' AND "toStatus" = 'EXPIRED') OR ("eventType" = 'HOLD_CANCELLED' AND "fromStatus" = 'HELD' AND "toStatus" = 'CANCELLED'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_lifecycle_events" DROP CONSTRAINT "core_itinerary_lifecycle_events_transition_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_lifecycle_events" ADD CONSTRAINT "core_itinerary_lifecycle_events_transition_check" CHECK ("eventType" = 'HOLD_EXPIRED' AND "fromStatus" = 'HELD' AND "toStatus" = 'EXPIRED')`,
    );
  }
}
