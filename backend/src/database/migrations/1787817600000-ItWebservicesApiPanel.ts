import { MigrationInterface, QueryRunner } from 'typeorm';

export class ItWebservicesApiPanel1787817600000 implements MigrationInterface {
  name = 'ItWebservicesApiPanel1787817600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."AgencyApiKeyStatus" ADD VALUE IF NOT EXISTS 'REVOKED'`,
    );
  }

  // PostgreSQL enum labels cannot be removed safely while referenced. A rollback
  // therefore leaves REVOKED available; application rollback simply stops using it.
  async down(): Promise<void> {}
}
