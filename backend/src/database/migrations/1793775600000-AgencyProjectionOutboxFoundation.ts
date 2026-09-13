import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = [
  'agency_profiles',
  'agency_invoices',
  'agency_credit_requests',
] as const;

export class AgencyProjectionOutboxFoundation1793775600000 implements MigrationInterface {
  public readonly name = 'AgencyProjectionOutboxFoundation1793775600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(
        `ALTER TABLE "agency"."${table}" ADD "version" integer NOT NULL DEFAULT 1`,
      );
      await queryRunner.query(
        `ALTER TABLE "agency"."${table}" ADD CONSTRAINT "${table}_version_check" CHECK ("version" > 0)`,
      );
    }
    await queryRunner.query(`CREATE TABLE "agency"."agency_projection_audits" (
      "id" text NOT NULL,
      "aggregateType" text NOT NULL,
      "aggregateId" text NOT NULL,
      "recordVersion" integer NOT NULL,
      "mutation" text NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      CONSTRAINT "agency_projection_audits_version_check" CHECK ("recordVersion" > 0),
      CONSTRAINT "agency_projection_audits_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "agency_projection_audits_aggregate_version_key" ON "agency"."agency_projection_audits" ("aggregateType", "aggregateId", "recordVersion")`,
    );
    await queryRunner.query(`
      CREATE FUNCTION "agency"."reject_agency_projection_audit_mutation"()
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
      `CREATE TRIGGER "agency_projection_audits_immutable_guard" BEFORE UPDATE OR DELETE ON "agency"."agency_projection_audits" FOR EACH ROW EXECUTE FUNCTION "agency"."reject_agency_projection_audit_mutation"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "agency_projection_audits_immutable_guard" ON "agency"."agency_projection_audits"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "agency"."reject_agency_projection_audit_mutation"()`,
    );
    await queryRunner.query(`DROP TABLE "agency"."agency_projection_audits"`);
    for (const table of [...TABLES].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "agency"."${table}" DROP CONSTRAINT "${table}_version_check"`,
      );
      await queryRunner.query(
        `ALTER TABLE "agency"."${table}" DROP COLUMN "version"`,
      );
    }
  }
}
