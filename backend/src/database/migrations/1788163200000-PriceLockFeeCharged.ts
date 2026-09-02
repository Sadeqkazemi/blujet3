import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Tracks whether the price-lock fee was actually debited from the wallet. */
export class PriceLockFeeCharged1788163200000 implements MigrationInterface {
  name = 'PriceLockFeeCharged1788163200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "price_locks"
        ADD COLUMN IF NOT EXISTS "feeCharged" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "price_locks"
        DROP COLUMN IF EXISTS "feeCharged"
    `);
  }
}
