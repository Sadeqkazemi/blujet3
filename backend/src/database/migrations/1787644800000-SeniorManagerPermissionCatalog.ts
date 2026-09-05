import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Preserve access for accounts created before dashboard/cartable became
 * individually assignable manager permissions. Null means unrestricted and
 * intentionally stays null.
 */
export class SeniorManagerPermissionCatalog1787644800000
  implements MigrationInterface
{
  name = 'SeniorManagerPermissionCatalog1787644800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users"
      SET "panelPermissions" = (
        SELECT jsonb_agg(DISTINCT value)
        FROM jsonb_array_elements_text(
          "panelPermissions" || '["dashboard", "cartable"]'::jsonb
        ) AS p(value)
      )
      WHERE "panelPermissions" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users"
      SET "panelPermissions" = "panelPermissions" - 'dashboard' - 'cartable'
      WHERE "panelPermissions" IS NOT NULL
    `);
  }
}
