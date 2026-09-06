import type { MigrationInterface, QueryRunner } from 'typeorm';

const IMMUTABLE_TABLES = [
  ['payments', 'ledger_entries'],
  ['payments', 'wallet_entries'],
  ['payments', 'bank_loan_webhook_events'],
  ['loyalty', 'club_points_entries'],
  ['audit', 'audit_logs'],
] as const;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Database enforcement for the append-only boundary described by the
 * architecture and financial rules. Corrections are represented by a new
 * reversal/adjustment row; the historical row is never rewritten.
 */
export class ImmutableFinancialAuditRows1791900000000 implements MigrationInterface {
  public readonly name = 'ImmutableFinancialAuditRows1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "audit"."reject_immutable_row_mutation"()
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

    for (const [schema, table] of IMMUTABLE_TABLES) {
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
    for (const [schema, table] of [...IMMUTABLE_TABLES].reverse()) {
      const trigger = `${table}_append_only_guard`;
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS ${quoteIdentifier(trigger)} ON ${quoteIdentifier(schema)}.${quoteIdentifier(table)}`,
      );
    }

    await queryRunner.query(
      'DROP FUNCTION IF EXISTS "audit"."reject_immutable_row_mutation"()',
    );
  }
}
