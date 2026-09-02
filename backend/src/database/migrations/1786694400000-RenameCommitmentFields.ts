import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames CharterCommitment/AgencySeatCommitment's period/amount columns to
 * match the API contract frontend PR #126 expects: `periodStart` ->
 * `startDate`, `periodEnd` -> `releaseAt` (mirrors the existing
 * AgencyAllotment.releaseAt naming convention), `amountIrr` ->
 * `contractPriceIrr` (mirrors AgencyAllotment.contractPriceIrr). Purely a
 * rename — no data is transformed, no rows are touched. Both tables were
 * added in the previous migration in this same PR and have no external
 * consumers yet, so this is a same-cycle contract fix, not a breaking
 * change against anything already shipped.
 */
export class RenameCommitmentFields1786694400000 implements MigrationInterface {
  name = 'RenameCommitmentFields1786694400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['charter_commitments', 'agency_seat_commitments']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" RENAME COLUMN "periodStart" TO "startDate"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" RENAME COLUMN "periodEnd" TO "releaseAt"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" RENAME COLUMN "amountIrr" TO "contractPriceIrr"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['charter_commitments', 'agency_seat_commitments']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" RENAME COLUMN "contractPriceIrr" TO "amountIrr"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" RENAME COLUMN "releaseAt" TO "periodEnd"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" RENAME COLUMN "startDate" TO "periodStart"`,
      );
    }
  }
}
