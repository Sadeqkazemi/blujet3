import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteSandboxUat1786176000000 implements MigrationInterface {
  name = 'CompleteSandboxUat1786176000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" ADD "commercialApprovedById" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" ADD "commercialApprovedAt" TIMESTAMP(3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" ADD "financeApprovedById" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" ADD "financeApprovedAt" TIMESTAMP(3)`,
    );
    await queryRunner.query(`ALTER TABLE "bookings" ADD "allotmentId" text`);
    await queryRunner.query(
      `CREATE INDEX "bookings_allotmentId_idx" ON "bookings" ("allotmentId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" ADD CONSTRAINT "agency_membership_requests_commercialApprovedById_fkey" FOREIGN KEY ("commercialApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" ADD CONSTRAINT "agency_membership_requests_financeApprovedById_fkey" FOREIGN KEY ("financeApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "bookings_allotmentId_fkey" FOREIGN KEY ("allotmentId") REFERENCES "agency_allotments"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "bookings_allotmentId_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" DROP CONSTRAINT "agency_membership_requests_financeApprovedById_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" DROP CONSTRAINT "agency_membership_requests_commercialApprovedById_fkey"`,
    );
    await queryRunner.query(`DROP INDEX "public"."bookings_allotmentId_idx"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "allotmentId"`);
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" DROP COLUMN "financeApprovedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" DROP COLUMN "financeApprovedById"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" DROP COLUMN "commercialApprovedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_membership_requests" DROP COLUMN "commercialApprovedById"`,
    );
  }
}
