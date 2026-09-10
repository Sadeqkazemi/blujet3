import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CartableProjectionOutbox1793174400000 implements MigrationInterface {
  public readonly name = 'CartableProjectionOutbox1793174400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ops"."cartable_tasks" ADD "version" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "ops"."cartable_tasks" ADD CONSTRAINT "cartable_tasks_version_check" CHECK ("version" > 0)`,
    );
    await queryRunner.query(`CREATE TABLE "ops"."cartable_projection_audits" (
      "id" text NOT NULL,
      "taskId" text NOT NULL,
      "taskVersion" integer NOT NULL,
      "mutation" text NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      CONSTRAINT "cartable_projection_audits_task_version_check" CHECK ("taskVersion" > 0),
      CONSTRAINT "cartable_projection_audits_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "cartable_projection_audits_task_version_key" ON "ops"."cartable_projection_audits" ("taskId", "taskVersion")`,
    );
    await queryRunner.query(`
      CREATE FUNCTION "ops"."reject_cartable_projection_audit_mutation"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'append-only table %.% rejects % operations',
          TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
          USING ERRCODE = '55000';
      END;
      $$;
    `);
    await queryRunner.query(
      `CREATE TRIGGER "cartable_projection_audits_immutable_guard" BEFORE UPDATE OR DELETE ON "ops"."cartable_projection_audits" FOR EACH ROW EXECUTE FUNCTION "ops"."reject_cartable_projection_audit_mutation"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "cartable_projection_audits_immutable_guard" ON "ops"."cartable_projection_audits"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "ops"."reject_cartable_projection_audit_mutation"()`,
    );
    await queryRunner.query(`DROP TABLE "ops"."cartable_projection_audits"`);
    await queryRunner.query(
      `ALTER TABLE "ops"."cartable_tasks" DROP CONSTRAINT "cartable_tasks_version_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ops"."cartable_tasks" DROP COLUMN "version"`,
    );
  }
}
