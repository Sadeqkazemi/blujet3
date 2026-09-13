import type { MigrationInterface, QueryRunner } from 'typeorm';

const PROJECTION_TABLES = [
  'agency_profiles',
  'agency_invoices',
  'agency_credit_requests',
] as const;

export class AgencyVersionedProjection1793865600000 implements MigrationInterface {
  public readonly name = 'AgencyVersionedProjection1793865600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of PROJECTION_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "agency"."${table}" ADD "version" integer NOT NULL DEFAULT 1`,
      );
      await queryRunner.query(
        `ALTER TABLE "agency"."${table}" ADD CONSTRAINT "${table}_version_check" CHECK ("version" > 0)`,
      );
    }

    await queryRunner.query(`CREATE TABLE "agency"."agency_projection_event_receipts" (
      "eventId" uuid NOT NULL,
      "envelopeFingerprint" char(64) NOT NULL,
      "semanticFingerprint" char(64) NOT NULL,
      "aggregateType" text NOT NULL,
      "aggregateId" text NOT NULL,
      "recordVersion" integer NOT NULL,
      "auditId" text NOT NULL,
      "receivedAt" timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT "agency_projection_receipt_version_check" CHECK ("recordVersion" > 0),
      CONSTRAINT "agency_projection_receipt_aggregate_type_check" CHECK ("aggregateType" IN ('AgencyProfile', 'AgencyInvoice', 'AgencyCreditRequest')),
      CONSTRAINT "agency_projection_event_receipts_pkey" PRIMARY KEY ("eventId")
    )`);
    await queryRunner.query(
      `CREATE INDEX "agency_projection_receipt_aggregate_version_idx" ON "agency"."agency_projection_event_receipts" ("aggregateType", "aggregateId", "recordVersion")`,
    );
    await queryRunner.query(`
      CREATE FUNCTION "agency"."reject_agency_projection_receipt_mutation"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'agency projection receipts are immutable';
      END;
      $$
    `);
    await queryRunner.query(
      `CREATE TRIGGER "agency_projection_event_receipts_immutable_guard" BEFORE UPDATE OR DELETE ON "agency"."agency_projection_event_receipts" FOR EACH ROW EXECUTE FUNCTION "agency"."reject_agency_projection_receipt_mutation"()`,
    );
    await queryRunner.query(`CREATE TABLE "agency"."agency_projection_slots" (
      "aggregateType" text NOT NULL,
      "aggregateId" text NOT NULL,
      "recordVersion" integer NOT NULL,
      "semanticFingerprint" char(64) NOT NULL,
      "auditId" text NOT NULL,
      "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT "agency_projection_slot_version_check" CHECK ("recordVersion" > 0),
      CONSTRAINT "agency_projection_slot_aggregate_type_check" CHECK ("aggregateType" IN ('AgencyProfile', 'AgencyInvoice', 'AgencyCreditRequest')),
      CONSTRAINT "agency_projection_slots_pkey" PRIMARY KEY ("aggregateType", "aggregateId")
    )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "agency"."agency_projection_slots"');
    await queryRunner.query(
      'DROP TRIGGER "agency_projection_event_receipts_immutable_guard" ON "agency"."agency_projection_event_receipts"',
    );
    await queryRunner.query(
      'DROP FUNCTION "agency"."reject_agency_projection_receipt_mutation"()',
    );
    await queryRunner.query(
      'DROP TABLE "agency"."agency_projection_event_receipts"',
    );
    for (const table of [...PROJECTION_TABLES].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "agency"."${table}" DROP CONSTRAINT "${table}_version_check"`,
      );
      await queryRunner.query(
        `ALTER TABLE "agency"."${table}" DROP COLUMN "version"`,
      );
    }
  }
}
