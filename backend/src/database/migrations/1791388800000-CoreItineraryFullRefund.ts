import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CoreItineraryFullRefund1791388800000 implements MigrationInterface {
  name = 'CoreItineraryFullRefund1791388800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payments"."core_itinerary_refunds" (
        "id" text NOT NULL,
        "orderId" text NOT NULL,
        "ownerId" text NOT NULL,
        "idempotencyKey" text NOT NULL,
        "requestHash" text NOT NULL,
        "quoteReference" text NOT NULL,
        "refundReference" text NOT NULL,
        "grossAmountIrr" bigint NOT NULL,
        "penaltyAmountIrr" bigint NOT NULL,
        "refundableIrr" bigint NOT NULL,
        "quoteSnapshot" jsonb NOT NULL,
        "currency" text NOT NULL DEFAULT 'IRR',
        "status" text NOT NULL DEFAULT 'RECEIVED',
        "failureCode" text,
        "ledgerEntryId" text,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "core_itinerary_refunds_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "core_itinerary_refunds_status_check" CHECK ("status" IN ('RECEIVED', 'COMPLETED', 'REVIEW_REQUIRED')),
        CONSTRAINT "core_itinerary_refunds_amount_check" CHECK ("grossAmountIrr" > 0 AND "penaltyAmountIrr" >= 0 AND "refundableIrr" > 0 AND "grossAmountIrr" = "penaltyAmountIrr" + "refundableIrr"),
        CONSTRAINT "core_itinerary_refunds_failure_check" CHECK (("status" = 'REVIEW_REQUIRED' AND "failureCode" IS NOT NULL) OR ("status" != 'REVIEW_REQUIRED' AND "failureCode" IS NULL)),
        CONSTRAINT "core_itinerary_refunds_ledger_check" CHECK (("status" = 'COMPLETED' AND "ledgerEntryId" IS NOT NULL) OR ("status" != 'COMPLETED' AND "ledgerEntryId" IS NULL)),
        CONSTRAINT "core_itinerary_refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"."core_itinerary_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "core_itinerary_refunds_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "core_itinerary_refunds_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "payments"."ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_refunds_idempotencyKey_key" ON "payments"."core_itinerary_refunds" ("idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_refunds_refundReference_key" ON "payments"."core_itinerary_refunds" ("refundReference")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_refunds_ledgerEntryId_key" ON "payments"."core_itinerary_refunds" ("ledgerEntryId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "core_itinerary_refunds_orderId_idx" ON "payments"."core_itinerary_refunds" ("orderId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_ticket_documents" ADD "servicingStatus" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_ticket_documents" ADD "servicedAt" TIMESTAMP(3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_ticket_documents" ADD "servicingId" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_ticket_documents" ADD CONSTRAINT "core_itinerary_ticket_documents_servicingId_fkey" FOREIGN KEY ("servicingId") REFERENCES "payments"."core_itinerary_refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_flight_coupons" ADD "servicingStatus" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_flight_coupons" ADD "servicedAt" TIMESTAMP(3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_flight_coupons" ADD "servicingId" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_flight_coupons" ADD CONSTRAINT "core_itinerary_flight_coupons_servicingId_fkey" FOREIGN KEY ("servicingId") REFERENCES "payments"."core_itinerary_refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );

    await queryRunner.query(`
      CREATE TABLE "orders"."core_itinerary_coupon_events" (
        "id" text NOT NULL,
        "refundId" text NOT NULL,
        "documentId" text NOT NULL,
        "couponId" text NOT NULL,
        "operation" text NOT NULL DEFAULT 'REFUND',
        "fromStatus" text NOT NULL,
        "toStatus" text NOT NULL,
        "ruleSnapshot" jsonb NOT NULL,
        "occurredAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "core_itinerary_coupon_events_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "core_itinerary_coupon_events_transition_check" CHECK ("operation" = 'REFUND' AND "fromStatus" = 'OPEN' AND "toStatus" = 'REFUNDED'),
        CONSTRAINT "core_itinerary_coupon_events_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "payments"."core_itinerary_refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "core_itinerary_coupon_events_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "orders"."core_itinerary_ticket_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "core_itinerary_coupon_events_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "orders"."core_itinerary_flight_coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_coupon_events_refund_coupon_key" ON "orders"."core_itinerary_coupon_events" ("refundId", "couponId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "core_itinerary_coupon_events_documentId_idx" ON "orders"."core_itinerary_coupon_events" ("documentId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE "orders"."core_itinerary_coupon_events"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_flight_coupons" DROP CONSTRAINT "core_itinerary_flight_coupons_servicingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_flight_coupons" DROP COLUMN "servicingId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_flight_coupons" DROP COLUMN "servicedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_flight_coupons" DROP COLUMN "servicingStatus"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_ticket_documents" DROP CONSTRAINT "core_itinerary_ticket_documents_servicingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_ticket_documents" DROP COLUMN "servicingId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_ticket_documents" DROP COLUMN "servicedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"."core_itinerary_ticket_documents" DROP COLUMN "servicingStatus"`,
    );
    await queryRunner.query(`DROP TABLE "payments"."core_itinerary_refunds"`);
  }
}
