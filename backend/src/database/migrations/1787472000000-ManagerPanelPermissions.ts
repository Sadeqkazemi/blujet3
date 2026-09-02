import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ManagerPanelPermissions1787472000000 implements MigrationInterface {
  name = 'ManagerPanelPermissions1787472000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "panelPermissions" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "panelPermissions"`,
    );
  }
}
