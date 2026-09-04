import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Aligns persisted refund brackets with the approved BluJet policy. */
export class BluJetCancellationPolicy1791475200000 implements MigrationInterface {
  name = 'BluJetCancellationPolicy1791475200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "payments"."refund_penalty_rules"
      SET "minHoursBeforeDeparture" = 12,
          "labelFa" = 'بین ۱۲ تا ۲۴ ساعت مانده'
      WHERE "minHoursBeforeDeparture" = 3
        AND "penaltyPct" = 70
    `);
    await queryRunner.query(`
      UPDATE "payments"."refund_penalty_rules"
      SET "labelFa" = 'کمتر از ۱۲ ساعت / پس از پرواز'
      WHERE "minHoursBeforeDeparture" = 0
        AND "penaltyPct" = 100
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "payments"."refund_penalty_rules"
      SET "minHoursBeforeDeparture" = 3,
          "labelFa" = 'بین ۳ تا ۲۴ ساعت مانده'
      WHERE "minHoursBeforeDeparture" = 12
        AND "penaltyPct" = 70
        AND "labelFa" = 'بین ۱۲ تا ۲۴ ساعت مانده'
    `);
    await queryRunner.query(`
      UPDATE "payments"."refund_penalty_rules"
      SET "labelFa" = 'کمتر از ۳ ساعت / پس از پرواز'
      WHERE "minHoursBeforeDeparture" = 0
        AND "penaltyPct" = 100
        AND "labelFa" = 'کمتر از ۱۲ ساعت / پس از پرواز'
    `);
  }
}
