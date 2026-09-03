import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountableTicketDocuments1790870400000 implements MigrationInterface {
  name = 'AccountableTicketDocuments1790870400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "orders"."ticket_document_stocks" (
        "id" text NOT NULL,
        "documentType" text NOT NULL,
        "airlineNumericCode" text NOT NULL,
        "startSerial" bigint NOT NULL,
        "endSerial" bigint NOT NULL,
        "nextSerial" bigint NOT NULL,
        "status" text NOT NULL DEFAULT 'ACTIVE',
        "sourceAuthority" text NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ticket_document_stocks_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "ticket_document_stocks_type_check" CHECK ("documentType" IN ('ETICKET')),
        CONSTRAINT "ticket_document_stocks_status_check" CHECK ("status" IN ('ACTIVE', 'EXHAUSTED', 'QUARANTINED')),
        CONSTRAINT "ticket_document_stocks_airline_code_check" CHECK ("airlineNumericCode" ~ '^[0-9]{3}$'),
        CONSTRAINT "ticket_document_stocks_serials_check" CHECK ("startSerial" >= 0 AND "endSerial" <= 9999999999 AND "startSerial" <= "endSerial" AND "nextSerial" >= "startSerial" AND "nextSerial" <= "endSerial" + 1),
        CONSTRAINT "ticket_document_stocks_no_overlap" EXCLUDE USING gist (
          int8range(
            ("airlineNumericCode"::bigint * 10000000000) + "startSerial",
            ("airlineNumericCode"::bigint * 10000000000) + "endSerial",
            '[]'
          ) WITH &&
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ticket_document_stocks_allocation_idx" ON "orders"."ticket_document_stocks" ("documentType", "status", "startSerial")`,
    );

    await queryRunner.query(`
      CREATE TABLE "orders"."ticket_documents" (
        "id" text NOT NULL,
        "bookingId" text NOT NULL,
        "passengerId" text NOT NULL,
        "stockId" text,
        "documentNumber" text NOT NULL,
        "status" text NOT NULL DEFAULT 'ISSUED',
        "accountabilityStatus" text NOT NULL,
        "issueSource" text NOT NULL,
        "paymentReference" text,
        "issueSnapshot" jsonb NOT NULL,
        "issuedAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ticket_documents_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "ticket_documents_status_check" CHECK ("status" IN ('ISSUED')),
        CONSTRAINT "ticket_documents_accountability_check" CHECK ("accountabilityStatus" IN ('ACCOUNTABLE', 'QUARANTINED')),
        CONSTRAINT "ticket_documents_number_check" CHECK ("documentNumber" ~ '^[0-9]{13}$'),
        CONSTRAINT "ticket_documents_stock_accountability_check" CHECK (("accountabilityStatus" = 'ACCOUNTABLE' AND "stockId" IS NOT NULL) OR ("accountabilityStatus" = 'QUARANTINED' AND "stockId" IS NULL)),
        CONSTRAINT "ticket_documents_issue_source_check" CHECK ("issueSource" IN ('PUBLIC_PAYMENT', 'AGENCY_ALLOTMENT', 'STAFF_MANUAL', 'MANAGERIAL_LOCK', 'LEGACY_PASSENGER')),
        CONSTRAINT "ticket_documents_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "orders"."bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ticket_documents_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "orders"."passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ticket_documents_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "orders"."ticket_document_stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ticket_documents_documentNumber_key" ON "orders"."ticket_documents" ("documentNumber")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ticket_documents_passengerId_key" ON "orders"."ticket_documents" ("passengerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ticket_documents_bookingId_idx" ON "orders"."ticket_documents" ("bookingId")`,
    );

    await queryRunner.query(`
      INSERT INTO "orders"."ticket_documents" (
        "id", "bookingId", "passengerId", "stockId", "documentNumber",
        "status", "accountabilityStatus", "issueSource", "paymentReference",
        "issueSnapshot", "issuedAt"
      )
      SELECT
        'legacy-ticket-' || p."id",
        p."bookingId",
        p."id",
        NULL,
        p."ticketNo",
        'ISSUED',
        'QUARANTINED',
        'LEGACY_PASSENGER',
        NULL,
        jsonb_build_object(
          'bookingId', b."id",
          'pnr', b."pnr",
          'flightInstanceId', b."flightInstanceId",
          'channel', b."channel",
          'cabin', b."cabin",
          'currency', 'IRR',
          'passengerId', p."id",
          'passengerType', p."passengerType",
          'seatCode', p."seatCode",
          'extraSeatCode', p."extraSeatCode",
          'fareIrr', p."fareIrr"::text,
          'taxIrr', p."taxIrr"::text,
          'extraSeatFareIrr', p."extraSeatFareIrr"::text,
          'legacyBackfill', true
        ),
        COALESCE(p."ticketIssuedAt", b."createdAt", CURRENT_TIMESTAMP)
      FROM "orders"."passengers" p
      INNER JOIN "orders"."bookings" b ON b."id" = p."bookingId"
      WHERE p."ticketNo" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "orders"."ticket_documents"`);
    await queryRunner.query(`DROP TABLE "orders"."ticket_document_stocks"`);
  }
}
