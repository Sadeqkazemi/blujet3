import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LoyaltyProjectionInbox1793516400000 implements MigrationInterface {
  public readonly name = 'LoyaltyProjectionInbox1793516400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "loyalty"."loyalty_projection_event_receipts" (
      "eventId" uuid NOT NULL,
      "envelopeFingerprint" char(64) NOT NULL,
      "semanticFingerprint" char(64) NOT NULL,
      "aggregateType" text NOT NULL,
      "aggregateId" text NOT NULL,
      "recordVersion" integer NOT NULL,
      "auditId" text NOT NULL,
      "receivedAt" timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT "loyalty_projection_receipt_version_check" CHECK ("recordVersion" > 0),
      CONSTRAINT "loyalty_projection_receipt_aggregate_type_check" CHECK ("aggregateType" IN ('LoyaltyMember', 'LoyaltyPointsEntry', 'LoyaltyCardRequest', 'LoyaltyTierRule', 'LoyaltyPriceLock', 'LoyaltyReferral')),
      CONSTRAINT "loyalty_projection_event_receipts_pkey" PRIMARY KEY ("eventId")
    )`);
    await queryRunner.query(
      `CREATE INDEX "loyalty_projection_receipt_aggregate_version_idx" ON "loyalty"."loyalty_projection_event_receipts" ("aggregateType", "aggregateId", "recordVersion")`,
    );
    await queryRunner.query(`
      CREATE FUNCTION "loyalty"."reject_loyalty_projection_receipt_mutation"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'loyalty projection receipts are immutable';
      END;
      $$
    `);
    await queryRunner.query(
      `CREATE TRIGGER "loyalty_projection_event_receipts_immutable_guard" BEFORE UPDATE OR DELETE ON "loyalty"."loyalty_projection_event_receipts" FOR EACH ROW EXECUTE FUNCTION "loyalty"."reject_loyalty_projection_receipt_mutation"()`,
    );
    await queryRunner.query(`CREATE TABLE "loyalty"."loyalty_projection_slots" (
      "aggregateType" text NOT NULL,
      "aggregateId" text NOT NULL,
      "recordVersion" integer NOT NULL,
      "semanticFingerprint" char(64) NOT NULL,
      "auditId" text NOT NULL,
      "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT "loyalty_projection_slot_version_check" CHECK ("recordVersion" > 0),
      CONSTRAINT "loyalty_projection_slot_aggregate_type_check" CHECK ("aggregateType" IN ('LoyaltyMember', 'LoyaltyPointsEntry', 'LoyaltyCardRequest', 'LoyaltyTierRule', 'LoyaltyPriceLock', 'LoyaltyReferral')),
      CONSTRAINT "loyalty_projection_slots_pkey" PRIMARY KEY ("aggregateType", "aggregateId")
    )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "loyalty"."loyalty_projection_slots"');
    await queryRunner.query(
      'DROP TRIGGER "loyalty_projection_event_receipts_immutable_guard" ON "loyalty"."loyalty_projection_event_receipts"',
    );
    await queryRunner.query(
      'DROP FUNCTION "loyalty"."reject_loyalty_projection_receipt_mutation"()',
    );
    await queryRunner.query(
      'DROP TABLE "loyalty"."loyalty_projection_event_receipts"',
    );
  }
}
