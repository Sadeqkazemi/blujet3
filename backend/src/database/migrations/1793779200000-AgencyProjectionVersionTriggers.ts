import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = [
  'agency_profiles',
  'agency_invoices',
  'agency_credit_requests',
] as const;

export class AgencyProjectionVersionTriggers1793779200000 implements MigrationInterface {
  public readonly name = 'AgencyProjectionVersionTriggers1793779200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION "agency"."advance_agency_projection_version"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW."version" := OLD."version" + 1;
        RETURN NEW;
      END;
      $$;
    `);
    for (const table of TABLES) {
      await queryRunner.query(
        `CREATE TRIGGER "${table}_version_guard" BEFORE UPDATE ON "agency"."${table}" FOR EACH ROW EXECUTE FUNCTION "agency"."advance_agency_projection_version"()`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...TABLES].reverse()) {
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS "${table}_version_guard" ON "agency"."${table}"`,
      );
    }
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "agency"."advance_agency_projection_version"()`,
    );
  }
}
