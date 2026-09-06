import { MigrationInterface, QueryRunner } from 'typeorm';

// Expand-only Reporting read model. It has no foreign keys into Core schemas.
export class ReportingItineraryProjections1791734400000 implements MigrationInterface {
  name = 'ReportingItineraryProjections1791734400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA IF NOT EXISTS "reporting"');
    await queryRunner.query(`CREATE TABLE "reporting"."core_itinerary_event_receipts" (
      "eventId" uuid NOT NULL,
      "fingerprint" character(64) NOT NULL,
      "orderId" text NOT NULL,
      "eventType" text NOT NULL,
      "orderVersion" integer NOT NULL,
      "receivedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "reporting_itinerary_event_receipts_pkey" PRIMARY KEY ("eventId"),
      CONSTRAINT "reporting_itinerary_receipt_event_type_check" CHECK ("eventType" IN ('OrderCreated', 'PaymentConfirmed', 'TicketIssued', 'RefundRequested')),
      CONSTRAINT "reporting_itinerary_receipt_order_version_check" CHECK ("orderVersion" > 0))`);
    await queryRunner.query(
      'CREATE INDEX "reporting_itinerary_receipt_slot_version_idx" ON "reporting"."core_itinerary_event_receipts" ("orderId", "eventType", "orderVersion")',
    );
    await queryRunner.query(`CREATE TABLE "reporting"."core_itinerary_event_projections" (
      "orderId" text NOT NULL,
      "eventType" text NOT NULL,
      "eventId" uuid NOT NULL,
      "fingerprint" character(64) NOT NULL,
      "orderVersion" integer NOT NULL,
      "currency" text NOT NULL,
      "payload" jsonb NOT NULL,
      "occurredAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
      "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "reporting_itinerary_event_projections_pkey" PRIMARY KEY ("orderId", "eventType"),
      CONSTRAINT "reporting_itinerary_projection_event_type_check" CHECK ("eventType" IN ('OrderCreated', 'PaymentConfirmed', 'TicketIssued', 'RefundRequested')),
      CONSTRAINT "reporting_itinerary_projection_order_version_check" CHECK ("orderVersion" > 0),
      CONSTRAINT "reporting_itinerary_projection_currency_check" CHECK ("currency" = 'IRR'))`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "reporting_itinerary_projection_event_id_key" ON "reporting"."core_itinerary_event_projections" ("eventId")',
    );
    await queryRunner.query(
      'CREATE INDEX "reporting_itinerary_projection_occurred_at_idx" ON "reporting"."core_itinerary_event_projections" ("occurredAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "reporting"."core_itinerary_event_projections"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "reporting"."core_itinerary_event_receipts"',
    );
  }
}
