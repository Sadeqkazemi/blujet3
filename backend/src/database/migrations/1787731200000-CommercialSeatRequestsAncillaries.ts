import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommercialSeatRequestsAncillaries1787731200000 implements MigrationInterface {
  name = 'CommercialSeatRequestsAncillaries1787731200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."AgencyInvoiceStatus" ADD VALUE IF NOT EXISTS 'VOIDED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_invoices" ADD "descriptionFa" text`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."AgencySeatRequestPayMethod" AS ENUM('CREDIT', 'INVOICE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."AgencySeatRequestStatus" AS ENUM('PENDING', 'PENDING_FINANCE', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "agency_seat_requests" (
        "id" text NOT NULL,
        "agencyId" text NOT NULL,
        "routeId" text,
        "aircraftType" text NOT NULL,
        "seats" integer NOT NULL,
        "termMonths" smallint,
        "unitPriceIrr" bigint NOT NULL,
        "payMethod" "public"."AgencySeatRequestPayMethod" NOT NULL DEFAULT 'INVOICE',
        "status" "public"."AgencySeatRequestStatus" NOT NULL DEFAULT 'PENDING',
        "invoiceId" text,
        "dueAt" TIMESTAMP(3),
        "decidedById" text,
        "decidedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        CONSTRAINT "agency_seat_requests_pkey" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "agency_seat_requests_agencyId_status_idx" ON "agency_seat_requests" ("agencyId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "agency_seat_requests_status_createdAt_idx" ON "agency_seat_requests" ("status", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_seat_requests" ADD CONSTRAINT "agency_seat_requests_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_seat_requests" ADD CONSTRAINT "agency_seat_requests_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "agency_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_seat_requests" ADD CONSTRAINT "agency_seat_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `CREATE TABLE "agency_seat_request_flights" (
        "id" text NOT NULL,
        "seatRequestId" text NOT NULL,
        "flightInstanceId" text NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        CONSTRAINT "agency_seat_request_flights_pkey" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "agency_seat_request_flights_seatRequestId_flightInstanceId_key" ON "agency_seat_request_flights" ("seatRequestId", "flightInstanceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "agency_seat_request_flights_flightInstanceId_idx" ON "agency_seat_request_flights" ("flightInstanceId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_seat_request_flights" ADD CONSTRAINT "agency_seat_request_flights_seatRequestId_fkey" FOREIGN KEY ("seatRequestId") REFERENCES "agency_seat_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_seat_request_flights" ADD CONSTRAINT "agency_seat_request_flights_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "flight_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."AncillaryServiceCategory" AS ENUM('SEAT', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ancillary_services" (
        "key" text NOT NULL,
        "category" "public"."AncillaryServiceCategory" NOT NULL,
        "titleFa" text NOT NULL,
        "descriptionFa" text NOT NULL DEFAULT '',
        "priceIrr" bigint NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "isCustom" boolean NOT NULL DEFAULT false,
        "updatedById" text,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        CONSTRAINT "ancillary_services_pkey" PRIMARY KEY ("key")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "ancillary_services_category_enabled_idx" ON "ancillary_services" ("category", "enabled")`,
    );
    await queryRunner.query(
      `ALTER TABLE "ancillary_services" ADD CONSTRAINT "ancillary_services_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );

    await queryRunner.query(`
      INSERT INTO "ancillary_services"
        ("key", "category", "titleFa", "descriptionFa", "priceIrr", "enabled", "isCustom")
      VALUES
        ('seat-normal', 'SEAT', 'صندلی عادی', 'صندلی استاندارد بدون هزینه اضافه', 0, true, false),
        ('seat-legroom', 'SEAT', 'صندلی با فضای پای بیشتر', 'ردیف خروج اضطراری یا ردیف اول', 3500000, true, false),
        ('seat-window-aisle', 'SEAT', 'صندلی کنار پنجره یا راهرو', 'انتخاب موقعیت دلخواه صندلی', 1500000, true, false),
        ('baggage', 'OTHER', 'بار اضافه', 'هر ۵ کیلوگرم بار اضافه بر مجاز', 2000000, true, false),
        ('meal', 'OTHER', 'وعده غذایی ویژه', 'وعده غذایی گرم در پروازهای بلندمدت', 1200000, true, false),
        ('insurance', 'OTHER', 'بیمه مسافرتی', 'پوشش بیمه سفر برای هر مسافر', 900000, true, false),
        ('cip', 'OTHER', 'خدمات CIP فرودگاهی', 'ترانزیت اختصاصی و سالن ویژه فرودگاه', 15000000, false, false),
        ('refund-fee', 'OTHER', 'هزینه استرداد بلیط', 'کسر از مبلغ استرداد طبق قوانین بلیط', 500000, true, false),
        ('pet', 'OTHER', 'حمل حیوان خانگی', 'حمل حیوان خانگی در کابین یا انبار', 2500000, false, false),
        ('wheelchair', 'OTHER', 'خدمات ویلچر', 'درخواست ویلچر در فرودگاه مبدأ و مقصد', 0, true, false),
        ('seat-selection', 'OTHER', 'انتخاب صندلی از پیش', 'انتخاب شماره صندلی هنگام رزرو', 800000, true, false)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ancillary_services" DROP CONSTRAINT "ancillary_services_updatedById_fkey"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ancillary_services_category_enabled_idx"`,
    );
    await queryRunner.query(`DROP TABLE "ancillary_services"`);
    await queryRunner.query(`DROP TYPE "public"."AncillaryServiceCategory"`);

    await queryRunner.query(
      `ALTER TABLE "agency_seat_request_flights" DROP CONSTRAINT "agency_seat_request_flights_flightInstanceId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_seat_request_flights" DROP CONSTRAINT "agency_seat_request_flights_seatRequestId_fkey"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."agency_seat_request_flights_flightInstanceId_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."agency_seat_request_flights_seatRequestId_flightInstanceId_key"`,
    );
    await queryRunner.query(`DROP TABLE "agency_seat_request_flights"`);

    await queryRunner.query(
      `ALTER TABLE "agency_seat_requests" DROP CONSTRAINT "agency_seat_requests_decidedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_seat_requests" DROP CONSTRAINT "agency_seat_requests_invoiceId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_seat_requests" DROP CONSTRAINT "agency_seat_requests_routeId_fkey"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."agency_seat_requests_status_createdAt_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."agency_seat_requests_agencyId_status_idx"`,
    );
    await queryRunner.query(`DROP TABLE "agency_seat_requests"`);
    await queryRunner.query(`DROP TYPE "public"."AgencySeatRequestStatus"`);
    await queryRunner.query(`DROP TYPE "public"."AgencySeatRequestPayMethod"`);

    await queryRunner.query(
      `ALTER TABLE "agency_invoices" DROP COLUMN "descriptionFa"`,
    );
  }
}
