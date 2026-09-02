import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames the original soft-removal columns to the product terminology used
 * by the API and UI. The first migration remains in the chain so deployments
 * that already ran it and fresh databases both converge on the same schema.
 */
export class ClubMemberDeactivationTerminology1789392000000 implements MigrationInterface {
  name = 'ClubMemberDeactivationTerminology1789392000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "club_members" DROP CONSTRAINT IF EXISTS "club_members_removedById_fkey"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "club_members_removedAt_idx"`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'club_members' AND column_name = 'removedAt'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'club_members' AND column_name = 'deactivatedAt'
        ) THEN
          ALTER TABLE "club_members" RENAME COLUMN "removedAt" TO "deactivatedAt";
        END IF;
      END $$
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'club_members' AND column_name = 'removedById'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'club_members' AND column_name = 'deactivatedById'
        ) THEN
          ALTER TABLE "club_members" RENAME COLUMN "removedById" TO "deactivatedById";
        END IF;
      END $$
    `);
    await queryRunner.query(
      `ALTER TABLE "club_members" ADD COLUMN IF NOT EXISTS "deactivatedAt" timestamp(3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_members" ADD COLUMN IF NOT EXISTS "deactivatedById" text`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "club_members_deactivatedAt_idx" ON "club_members" ("deactivatedAt")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'club_members_deactivatedById_fkey'
        ) THEN
          ALTER TABLE "club_members"
            ADD CONSTRAINT "club_members_deactivatedById_fkey"
            FOREIGN KEY ("deactivatedById") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "club_members" DROP CONSTRAINT IF EXISTS "club_members_deactivatedById_fkey"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "club_members_deactivatedAt_idx"`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'club_members' AND column_name = 'deactivatedAt'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'club_members' AND column_name = 'removedAt'
        ) THEN
          ALTER TABLE "club_members" RENAME COLUMN "deactivatedAt" TO "removedAt";
        END IF;
      END $$
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'club_members' AND column_name = 'deactivatedById'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'club_members' AND column_name = 'removedById'
        ) THEN
          ALTER TABLE "club_members" RENAME COLUMN "deactivatedById" TO "removedById";
        END IF;
      END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "club_members_removedAt_idx" ON "club_members" ("removedAt")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'club_members_removedById_fkey'
        ) THEN
          ALTER TABLE "club_members"
            ADD CONSTRAINT "club_members_removedById_fkey"
            FOREIGN KEY ("removedById") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$
    `);
  }
}
