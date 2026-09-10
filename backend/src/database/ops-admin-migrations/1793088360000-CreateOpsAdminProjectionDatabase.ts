import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOpsAdminProjectionDatabase1793088360000 implements MigrationInterface {
  public readonly name = 'CreateOpsAdminProjectionDatabase1793088360000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA IF NOT EXISTS "ops"');
    await queryRunner.query(
      `CREATE TYPE "ops"."CartableCategory" AS ENUM('ADMIN', 'AGENCY', 'MANAGER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "ops"."CartableSourceType" AS ENUM('MANAGER_MESSAGE', 'MANAGER_REFERRAL', 'AGENCY_REQUEST', 'CHAIR_PERMISSION', 'EMPLOYEE_MESSAGE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "ops"."CartableStatus" AS ENUM('OPEN', 'APPROVED', 'REJECTED', 'TRANSFERRED')`,
    );
    await queryRunner.query(`CREATE TABLE "ops"."cartable_tasks" (
      "id" text NOT NULL,
      "assigneeId" text NOT NULL,
      "category" "ops"."CartableCategory" NOT NULL,
      "sourceType" "ops"."CartableSourceType",
      "sourceId" text,
      "status" "ops"."CartableStatus" NOT NULL DEFAULT 'OPEN',
      "resolvedAt" TIMESTAMP(3),
      "readAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      CONSTRAINT "cartable_tasks_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "ops_admin_cartable_status_created_idx" ON "ops"."cartable_tasks" ("status", "createdAt", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ops_admin_cartable_status_category_created_idx" ON "ops"."cartable_tasks" ("status", "category", "createdAt", "id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP SCHEMA IF EXISTS "ops" CASCADE');
  }
}
