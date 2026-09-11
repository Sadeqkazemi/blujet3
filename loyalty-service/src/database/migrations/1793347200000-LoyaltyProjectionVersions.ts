import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = [
  'club_members',
  'club_points_entries',
  'club_card_requests',
  'club_tier_rules',
  'price_locks',
  'customer_referrals',
] as const;

export class LoyaltyProjectionVersions1793347200000 implements MigrationInterface {
  public readonly name = 'LoyaltyProjectionVersions1793347200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(
        `ALTER TABLE "loyalty"."${table}" ADD "version" integer NOT NULL DEFAULT 1`,
      );
      await queryRunner.query(
        `ALTER TABLE "loyalty"."${table}" ADD CONSTRAINT "${table}_version_check" CHECK ("version" > 0)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...TABLES].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "loyalty"."${table}" DROP CONSTRAINT "${table}_version_check"`,
      );
      await queryRunner.query(
        `ALTER TABLE "loyalty"."${table}" DROP COLUMN "version"`,
      );
    }
  }
}
