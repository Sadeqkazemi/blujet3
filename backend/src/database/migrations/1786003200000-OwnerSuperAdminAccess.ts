import { MigrationInterface, QueryRunner } from 'typeorm';

export class OwnerSuperAdminAccess1786003200000 implements MigrationInterface {
  name = 'OwnerSuperAdminAccess1786003200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "isSuperAdmin" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_one_active_super_admin_idx" ON "users" ("isSuperAdmin") WHERE "isSuperAdmin" = true AND "deletedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "users_one_active_super_admin_idx"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isSuperAdmin"`);
  }
}
