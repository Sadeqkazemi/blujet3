import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PassengerEtickets1790086400000 implements MigrationInterface {
  name = 'PassengerEtickets1790086400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "passengers" ADD "ticketNo" text`);
    await queryRunner.query(
      `ALTER TABLE "passengers" ADD "ticketIssuedAt" TIMESTAMP(3)`,
    );
    await queryRunner.query(`
      WITH issued AS (
        SELECT p.id,
               row_number() OVER (ORDER BY p.id) AS sequence,
               COALESCE(b."createdAt", CURRENT_TIMESTAMP) AS issued_at
        FROM passengers p
        INNER JOIN bookings b ON b.id = p."bookingId"
        WHERE b.status IN ('TICKETED', 'FLOWN', 'NO_SHOW', 'REFUNDED')
          AND p."deletedAt" IS NULL
      )
      UPDATE passengers p
      SET "ticketNo" = '780' || lpad(issued.sequence::text, 10, '0'),
          "ticketIssuedAt" = issued.issued_at
      FROM issued
      WHERE issued.id = p.id
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "passengers_ticketNo_key" ON "passengers" ("ticketNo")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."passengers_ticketNo_key"`);
    await queryRunner.query(
      `ALTER TABLE "passengers" DROP COLUMN "ticketIssuedAt"`,
    );
    await queryRunner.query(`ALTER TABLE "passengers" DROP COLUMN "ticketNo"`);
  }
}
