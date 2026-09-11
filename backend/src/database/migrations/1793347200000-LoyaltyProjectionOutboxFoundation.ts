import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = [
  'club_members',
  'club_points_entries',
  'club_card_requests',
  'club_tier_rules',
  'price_locks',
  'customer_referrals',
] as const;

export class LoyaltyProjectionOutboxFoundation1793347200000 implements MigrationInterface {
  public readonly name = 'LoyaltyProjectionOutboxFoundation1793347200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(
        `ALTER TABLE "loyalty"."${table}" ADD "version" integer NOT NULL DEFAULT 1`,
      );
      await queryRunner.query(
        `ALTER TABLE "loyalty"."${table}" ADD CONSTRAINT "${table}_version_check" CHECK ("version" > 0)`,
      );
    }
    await queryRunner.query(`CREATE TABLE "loyalty"."loyalty_projection_audits" (
      "id" text NOT NULL,
      "aggregateType" text NOT NULL,
      "aggregateId" text NOT NULL,
      "recordVersion" integer NOT NULL,
      "mutation" text NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      CONSTRAINT "loyalty_projection_audits_version_check" CHECK ("recordVersion" > 0),
      CONSTRAINT "loyalty_projection_audits_pkey" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "loyalty_projection_audits_aggregate_version_key" ON "loyalty"."loyalty_projection_audits" ("aggregateType", "aggregateId", "recordVersion")`,
    );
    await queryRunner.query(`
      CREATE FUNCTION "loyalty"."reject_loyalty_projection_audit_mutation"()
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
      `CREATE TRIGGER "loyalty_projection_audits_immutable_guard" BEFORE UPDATE OR DELETE ON "loyalty"."loyalty_projection_audits" FOR EACH ROW EXECUTE FUNCTION "loyalty"."reject_loyalty_projection_audit_mutation"()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "loyalty_projection_audits_immutable_guard" ON "loyalty"."loyalty_projection_audits"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "loyalty"."reject_loyalty_projection_audit_mutation"()`,
    );
    await queryRunner.query(`DROP TABLE "loyalty"."loyalty_projection_audits"`);
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
