import type { MigrationInterface, QueryRunner } from 'typeorm';

const IMMUTABLE_ORDER_EVIDENCE_TABLES = [
  ['orders', 'booking_lifecycle_events'],
  ['orders', 'core_itinerary_lifecycle_events'],
  ['orders', 'core_itinerary_coupon_events'],
] as const;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Protects immutable order transition evidence. The shared trigger function is
 * created by ImmutableFinancialAuditRows and deliberately remains owned by
 * that migration so this migration can be reverted independently.
 */
export class ImmutableOrderEvidenceRows1791990000000 implements MigrationInterface {
  public readonly name = 'ImmutableOrderEvidenceRows1791990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [schema, table] of IMMUTABLE_ORDER_EVIDENCE_TABLES) {
      const trigger = `${table}_append_only_guard`;
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS ${quoteIdentifier(trigger)} ON ${quoteIdentifier(schema)}.${quoteIdentifier(table)}`,
      );
      await queryRunner.query(
        `CREATE TRIGGER ${quoteIdentifier(trigger)} BEFORE UPDATE OR DELETE ON ${quoteIdentifier(schema)}.${quoteIdentifier(table)} FOR EACH ROW EXECUTE FUNCTION "audit"."reject_immutable_row_mutation"()`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [schema, table] of [
      ...IMMUTABLE_ORDER_EVIDENCE_TABLES,
    ].reverse()) {
      const trigger = `${table}_append_only_guard`;
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS ${quoteIdentifier(trigger)} ON ${quoteIdentifier(schema)}.${quoteIdentifier(table)}`,
      );
    }
  }
}
