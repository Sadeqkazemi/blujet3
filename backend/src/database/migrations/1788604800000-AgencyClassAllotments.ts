import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgencyClassAllotments1788604800000
  implements MigrationInterface
{
  name = 'AgencyClassAllotments1788604800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agency_seat_requests" ADD COLUMN "cabin" "public"."CabinClass"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_seat_requests" ADD COLUMN "fareClassCode" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_allotments" ADD COLUMN "cabin" "public"."CabinClass"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_allotments" ADD COLUMN "fareClassCode" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_allotments" ADD COLUMN "seatRequestId" text`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "agency_allotments_seatRequestId_flightInstanceId_key" ON "agency_allotments" ("seatRequestId", "flightInstanceId") WHERE "seatRequestId" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."agency_allotments_seatRequestId_flightInstanceId_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_allotments" DROP COLUMN "seatRequestId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_allotments" DROP COLUMN "fareClassCode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_allotments" DROP COLUMN "cabin"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_seat_requests" DROP COLUMN "fareClassCode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_seat_requests" DROP COLUMN "cabin"`,
    );
  }
}
