import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingReplayFingerprint1790611200000 implements MigrationInterface {
  name = 'BookingReplayFingerprint1790611200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "orders"."bookings" ADD "idempotencyRequestHash" text',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "orders"."bookings" DROP COLUMN "idempotencyRequestHash"',
    );
  }
}
