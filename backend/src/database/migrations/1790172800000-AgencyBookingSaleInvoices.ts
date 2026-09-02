import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AgencyBookingSaleInvoices1790172800000 implements MigrationInterface {
  name = 'AgencyBookingSaleInvoices1790172800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agency_invoices" ADD "bookingId" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_invoices" ADD CONSTRAINT "agency_invoices_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "agency_invoices_bookingId_key" ON "agency_invoices" ("bookingId")`,
    );

    // Older agency checkouts already have agency ownership on the booking but
    // their SALE ledger predated agency attribution. Repair only those rows.
    await queryRunner.query(`
      UPDATE ledger_entries le
      SET "agencyId" = b."agencyId"
      FROM bookings b
      WHERE le."bookingId" = b.id
        AND b."agencyId" IS NOT NULL
        AND le."agencyId" IS NULL
        AND le.type = 'SALE'
    `);

    // Materialize one paid invoice for each historical, completed agency
    // customer sale. Text IDs and PNR-derived invoice numbers keep the
    // backfill deterministic and retry-safe without database extensions.
    await queryRunner.query(`
      INSERT INTO agency_invoices (
        id, "agencyId", "bookingId", "invoiceNo", "issuedById", "issuedAt",
        "dueAt", "amountIrr", "descriptionFa", status, "paidAt"
      )
      SELECT
        'booking-sale-' || b.id,
        b."agencyId",
        b.id,
        'SALE-' || b.pnr,
        b."agencyId",
        b."createdAt",
        b."createdAt",
        b."priceIrr",
        'فاکتور فروش بلیط ' || b.pnr,
        'PAID',
        b."createdAt"
      FROM bookings b
      WHERE b."agencyId" IS NOT NULL
        AND b.status IN ('PAID', 'TICKETED', 'FLOWN', 'NO_SHOW', 'REFUNDED')
        AND b."deletedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM agency_invoices i WHERE i."bookingId" = b.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM agency_invoices i WHERE i."invoiceNo" = 'SALE-' || b.pnr
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "agency_invoices" WHERE id LIKE 'booking-sale-%'`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."agency_invoices_bookingId_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_invoices" DROP CONSTRAINT "agency_invoices_bookingId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_invoices" DROP COLUMN "bookingId"`,
    );
  }
}
