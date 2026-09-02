import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AgencyLoginTwoFactorPurpose1786089600000 implements MigrationInterface {
  name = 'AgencyLoginTwoFactorPurpose1786089600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."TwoFactorPurpose" ADD VALUE IF NOT EXISTS 'AGENCY_LOGIN_2FA'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL enum values cannot be removed safely while rows may use them.
  }
}
