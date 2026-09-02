import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AircraftExitRows1789132800000 implements MigrationInterface {
  name = 'AircraftExitRows1789132800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" ADD COLUMN IF NOT EXISTS "exitRows" integer[] NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `UPDATE "aircraft_seat_maps" SET "exitRows" = ARRAY[19,20] WHERE REPLACE(UPPER("aircraftType"), '-', '') IN ('MD80', 'MD88')`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aircraft_seat_maps" DROP COLUMN IF EXISTS "exitRows"`,
    );
  }
}
