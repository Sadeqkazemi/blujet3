import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingHoldLifecycle1790784000000 implements MigrationInterface {
  name = 'BookingHoldLifecycle1790784000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "orders"."booking_lifecycle_events" (
        "id" text NOT NULL,
        "bookingId" text NOT NULL,
        "eventType" text NOT NULL,
        "fromStatus" text NOT NULL,
        "toStatus" text NOT NULL,
        "occurredAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        CONSTRAINT "booking_lifecycle_events_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "booking_lifecycle_events_transition_check" CHECK (
          "eventType" = 'HOLD_EXPIRED' AND "fromStatus" = 'HELD' AND "toStatus" = 'EXPIRED'
        ),
        CONSTRAINT "booking_lifecycle_events_bookingId_fkey" FOREIGN KEY ("bookingId")
          REFERENCES "orders"."bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "booking_lifecycle_events_bookingId_eventType_key"
      ON "orders"."booking_lifecycle_events" ("bookingId", "eventType")
    `);
    await queryRunner.query(`
      CREATE INDEX "booking_lifecycle_events_occurredAt_idx"
      ON "orders"."booking_lifecycle_events" ("occurredAt")
    `);
    await queryRunner.query(`
      CREATE INDEX "bookings_due_hold_expiry_idx"
      ON "orders"."bookings" ("holdExpiresAt", "id")
      WHERE "status" = 'HELD'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "orders"."bookings_due_hold_expiry_idx"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "orders"."booking_lifecycle_events"',
    );
  }
}
