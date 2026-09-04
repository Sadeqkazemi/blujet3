import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CoreItineraryPaymentFulfilment1791302400000 implements MigrationInterface {
  name = 'CoreItineraryPaymentFulfilment1791302400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payments"."core_itinerary_payment_confirmations" (
        "id" text NOT NULL,
        "orderId" text NOT NULL,
        "ownerId" text NOT NULL,
        "idempotencyKey" text NOT NULL,
        "requestHash" text NOT NULL,
        "paymentReference" text NOT NULL,
        "amountIrr" bigint NOT NULL,
        "currency" text NOT NULL DEFAULT 'IRR',
        "status" text NOT NULL DEFAULT 'RECEIVED',
        "failureCode" text,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "core_itinerary_payment_confirmations_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "core_itinerary_payment_confirmations_status_check" CHECK ("status" IN ('RECEIVED', 'COMPLETED', 'REVIEW_REQUIRED')),
        CONSTRAINT "core_itinerary_payment_confirmations_amount_check" CHECK ("amountIrr" > 0),
        CONSTRAINT "core_itinerary_payment_confirmations_failure_check" CHECK (("status" = 'REVIEW_REQUIRED' AND "failureCode" IS NOT NULL) OR ("status" != 'REVIEW_REQUIRED' AND "failureCode" IS NULL)),
        CONSTRAINT "core_itinerary_payment_confirmations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"."core_itinerary_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "core_itinerary_payment_confirmations_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_payment_confirmations_orderId_key" ON "payments"."core_itinerary_payment_confirmations" ("orderId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_payment_confirmations_idempotencyKey_key" ON "payments"."core_itinerary_payment_confirmations" ("idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_payment_confirmations_paymentReference_key" ON "payments"."core_itinerary_payment_confirmations" ("paymentReference")`,
    );

    await queryRunner.query(`
      CREATE TABLE "orders"."core_itinerary_ticket_documents" (
        "id" text NOT NULL,
        "orderId" text NOT NULL,
        "travellerId" text NOT NULL,
        "stockId" text NOT NULL,
        "documentNumber" text NOT NULL,
        "status" text NOT NULL DEFAULT 'ISSUED',
        "accountabilityStatus" text NOT NULL DEFAULT 'ACCOUNTABLE',
        "issueSource" text NOT NULL DEFAULT 'CORE_ITINERARY_PAYMENT',
        "paymentReference" text NOT NULL,
        "issueSnapshot" jsonb NOT NULL,
        "issuedAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "core_itinerary_ticket_documents_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "core_itinerary_ticket_documents_status_check" CHECK ("status" IN ('ISSUED')),
        CONSTRAINT "core_itinerary_ticket_documents_accountability_check" CHECK ("accountabilityStatus" IN ('ACCOUNTABLE')),
        CONSTRAINT "core_itinerary_ticket_documents_number_check" CHECK ("documentNumber" ~ '^[0-9]{13}$'),
        CONSTRAINT "core_itinerary_ticket_documents_source_check" CHECK ("issueSource" IN ('CORE_ITINERARY_PAYMENT')),
        CONSTRAINT "core_itinerary_ticket_documents_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"."core_itinerary_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "core_itinerary_ticket_documents_travellerId_fkey" FOREIGN KEY ("travellerId") REFERENCES "orders"."core_itinerary_travellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "core_itinerary_ticket_documents_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "orders"."ticket_document_stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_ticket_documents_documentNumber_key" ON "orders"."core_itinerary_ticket_documents" ("documentNumber")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_ticket_documents_travellerId_key" ON "orders"."core_itinerary_ticket_documents" ("travellerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "core_itinerary_ticket_documents_orderId_idx" ON "orders"."core_itinerary_ticket_documents" ("orderId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "orders"."core_itinerary_flight_coupons" (
        "id" text NOT NULL,
        "ticketDocumentId" text NOT NULL,
        "segmentId" text NOT NULL,
        "couponNumber" integer NOT NULL,
        "status" text NOT NULL DEFAULT 'OPEN',
        "fareIrr" bigint NOT NULL,
        "taxIrr" bigint NOT NULL,
        "baggageAllowanceKg" integer,
        "segmentSnapshot" jsonb NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "core_itinerary_flight_coupons_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "core_itinerary_flight_coupons_number_check" CHECK ("couponNumber" > 0),
        CONSTRAINT "core_itinerary_flight_coupons_status_check" CHECK ("status" IN ('OPEN')),
        CONSTRAINT "core_itinerary_flight_coupons_ticketDocumentId_fkey" FOREIGN KEY ("ticketDocumentId") REFERENCES "orders"."core_itinerary_ticket_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "core_itinerary_flight_coupons_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "orders"."core_itinerary_segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_flight_coupons_document_number_key" ON "orders"."core_itinerary_flight_coupons" ("ticketDocumentId", "couponNumber")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_flight_coupons_document_segment_key" ON "orders"."core_itinerary_flight_coupons" ("ticketDocumentId", "segmentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "core_itinerary_flight_coupons_segmentId_idx" ON "orders"."core_itinerary_flight_coupons" ("segmentId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "payments"."ledger_entries" ADD "itineraryOrderId" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments"."ledger_entries" ADD CONSTRAINT "ledger_entries_itineraryOrderId_fkey" FOREIGN KEY ("itineraryOrderId") REFERENCES "orders"."core_itinerary_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ledger_entries_itineraryOrderId_sale_key" ON "payments"."ledger_entries" ("itineraryOrderId") WHERE "itineraryOrderId" IS NOT NULL AND "type" = 'SALE'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "payments"."ledger_entries_itineraryOrderId_sale_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments"."ledger_entries" DROP CONSTRAINT "ledger_entries_itineraryOrderId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments"."ledger_entries" DROP COLUMN "itineraryOrderId"`,
    );
    await queryRunner.query(
      `DROP TABLE "orders"."core_itinerary_flight_coupons"`,
    );
    await queryRunner.query(
      `DROP TABLE "orders"."core_itinerary_ticket_documents"`,
    );
    await queryRunner.query(
      `DROP TABLE "payments"."core_itinerary_payment_confirmations"`,
    );
  }
}
