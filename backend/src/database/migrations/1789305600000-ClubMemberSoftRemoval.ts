import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubMemberSoftRemoval1789305600000 implements MigrationInterface {
  name = 'ClubMemberSoftRemoval1789305600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "club_members" ADD COLUMN IF NOT EXISTS "removedAt" timestamp(3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_members" ADD COLUMN IF NOT EXISTS "removedById" text`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "club_members_removedAt_idx" ON "club_members" ("removedAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_members" ADD CONSTRAINT "club_members_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "club_members" DROP CONSTRAINT IF EXISTS "club_members_removedById_fkey"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "club_members_removedAt_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_members" DROP COLUMN IF EXISTS "removedById"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_members" DROP COLUMN IF EXISTS "removedAt"`,
    );
  }
}
