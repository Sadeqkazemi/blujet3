import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SeatLockAgencyTarget1787558400000 implements MigrationInterface {
  name = 'SeatLockAgencyTarget1787558400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "seat_locks" ADD COLUMN "agencyId" text`,
    );
    await queryRunner.query(
      `CREATE INDEX "seat_locks_agencyId_idx" ON "seat_locks" ("agencyId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "seat_locks" ADD CONSTRAINT "seat_locks_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_profiles"("userId") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "seat_locks" DROP CONSTRAINT "seat_locks_agencyId_fkey"`,
    );
    await queryRunner.query(`DROP INDEX "seat_locks_agencyId_idx"`);
    await queryRunner.query(`ALTER TABLE "seat_locks" DROP COLUMN "agencyId"`);
  }
}
