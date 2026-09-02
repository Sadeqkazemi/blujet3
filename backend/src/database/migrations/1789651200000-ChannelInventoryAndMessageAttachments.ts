import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ChannelInventoryAndMessageAttachments1789651200000 implements MigrationInterface {
  name = 'ChannelInventoryAndMessageAttachments1789651200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fare_rules" ADD COLUMN "siteSeatsReleased" integer NOT NULL DEFAULT 0`,
    );
    // Existing fare allocations were publicly sellable before channel quotas
    // were introduced. Preserve that inventory during the migration; future
    // changes remain explicitly controlled from the commercial flight detail.
    await queryRunner.query(
      `UPDATE "fare_rules"
       SET "siteSeatsReleased" = GREATEST(
         0,
         "seatsAllocated" - COALESCE("agencySeatsReleased", 0)
       )`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_messages" ADD COLUMN "attachments" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "cartable_tasks" ADD COLUMN "attachments" jsonb`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cartable_tasks" DROP COLUMN "attachments"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agency_messages" DROP COLUMN "attachments"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fare_rules" DROP COLUMN "siteSeatsReleased"`,
    );
  }
}
