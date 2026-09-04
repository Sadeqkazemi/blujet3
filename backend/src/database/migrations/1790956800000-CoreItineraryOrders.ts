import { MigrationInterface, QueryRunner } from 'typeorm';

export class CoreItineraryOrders1790956800000 implements MigrationInterface {
  name = 'CoreItineraryOrders1790956800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "orders"."core_itinerary_orders" (
        "id" text NOT NULL,
        "pnr" text NOT NULL,
        "channel" "public"."BookingChannel" NOT NULL,
        "ownerId" text NOT NULL,
        "contactPhone" text,
        "status" "public"."BookingStatus" NOT NULL DEFAULT 'HELD',
        "currency" text NOT NULL DEFAULT 'IRR',
        "fareIrr" bigint NOT NULL,
        "taxIrr" bigint NOT NULL,
        "extrasIrr" bigint NOT NULL,
        "totalIrr" bigint NOT NULL,
        "holdExpiresAt" TIMESTAMP(3) NOT NULL,
        "idempotencyKey" text NOT NULL,
        "idempotencyRequestHash" text NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "core_itinerary_orders_pkey" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_orders_pnr_key" ON "orders"."core_itinerary_orders" ("pnr")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_orders_idempotencyKey_key" ON "orders"."core_itinerary_orders" ("idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "core_itinerary_orders_due_expiry_idx" ON "orders"."core_itinerary_orders" ("holdExpiresAt", "id") WHERE "status" = 'HELD'`,
    );

    await queryRunner.query(
      `CREATE TABLE "orders"."core_itinerary_segments" (
        "id" text NOT NULL,
        "orderId" text NOT NULL,
        "sequence" integer NOT NULL,
        "flightInstanceId" text NOT NULL,
        "flightNo" text NOT NULL,
        "originCode" text NOT NULL,
        "destinationCode" text NOT NULL,
        "departureAt" TIMESTAMP(3) NOT NULL,
        "arrivalAt" TIMESTAMP(3) NOT NULL,
        "cabin" "public"."CabinClass" NOT NULL,
        "fareClassCode" text,
        "occupiedSeats" integer NOT NULL,
        "baggageAllowanceKg" integer,
        "fareIrr" bigint NOT NULL,
        "taxIrr" bigint NOT NULL,
        "extrasIrr" bigint NOT NULL,
        "totalIrr" bigint NOT NULL,
        "extrasSnapshot" jsonb NOT NULL DEFAULT '[]',
        CONSTRAINT "core_itinerary_segments_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "core_itinerary_segments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"."core_itinerary_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "core_itinerary_segments_flightInstanceId_fkey" FOREIGN KEY ("flightInstanceId") REFERENCES "inventory"."flight_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_segments_order_sequence_key" ON "orders"."core_itinerary_segments" ("orderId", "sequence")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_segments_order_flight_key" ON "orders"."core_itinerary_segments" ("orderId", "flightInstanceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "core_itinerary_segments_flight_cabin_idx" ON "orders"."core_itinerary_segments" ("flightInstanceId", "cabin")`,
    );

    await queryRunner.query(
      `CREATE TABLE "orders"."core_itinerary_travellers" (
        "id" text NOT NULL,
        "orderId" text NOT NULL,
        "sequence" integer NOT NULL,
        "fullName" text NOT NULL,
        "passengerType" text NOT NULL,
        "birthDate" date NOT NULL,
        "nationalIdEnc" text,
        "nationalIdHash" text,
        "passportNoEnc" text,
        "mobileEnc" text,
        "gender" text,
        CONSTRAINT "core_itinerary_travellers_passengerType_check" CHECK ("passengerType" IN ('ADULT','CHILD','INFANT')),
        CONSTRAINT "core_itinerary_travellers_gender_check" CHECK ("gender" IS NULL OR "gender" IN ('male','female')),
        CONSTRAINT "core_itinerary_travellers_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "core_itinerary_travellers_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"."core_itinerary_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_travellers_order_sequence_key" ON "orders"."core_itinerary_travellers" ("orderId", "sequence")`,
    );
    await queryRunner.query(
      `CREATE INDEX "core_itinerary_travellers_nationalIdHash_idx" ON "orders"."core_itinerary_travellers" ("nationalIdHash")`,
    );

    await queryRunner.query(
      `CREATE TABLE "orders"."core_itinerary_traveller_segments" (
        "id" text NOT NULL,
        "travellerId" text NOT NULL,
        "segmentId" text NOT NULL,
        "occupiesSeat" boolean NOT NULL,
        "fareIrr" bigint NOT NULL,
        "taxIrr" bigint NOT NULL,
        CONSTRAINT "core_itinerary_traveller_segments_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "core_itinerary_traveller_segments_travellerId_fkey" FOREIGN KEY ("travellerId") REFERENCES "orders"."core_itinerary_travellers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "core_itinerary_traveller_segments_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "orders"."core_itinerary_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "core_itinerary_traveller_segments_pair_key" ON "orders"."core_itinerary_traveller_segments" ("travellerId", "segmentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "core_itinerary_traveller_segments_segment_idx" ON "orders"."core_itinerary_traveller_segments" ("segmentId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE "orders"."core_itinerary_traveller_segments"`,
    );
    await queryRunner.query(`DROP TABLE "orders"."core_itinerary_travellers"`);
    await queryRunner.query(`DROP TABLE "orders"."core_itinerary_segments"`);
    await queryRunner.query(`DROP TABLE "orders"."core_itinerary_orders"`);
  }
}
