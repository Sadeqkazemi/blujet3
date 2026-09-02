import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Agency documents belong to the authenticated agency user. This permits the
 * profile-less UAT agency to upload genuine documents without fabricating an
 * AgencyProfile business row; production agencies use the same user id. */
export class AgencyDocumentsOwnedByUser1789478400000 implements MigrationInterface {
  name = 'AgencyDocumentsOwnedByUser1789478400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agency_documents" DROP CONSTRAINT IF EXISTS "agency_documents_agencyId_fkey"`,
    );
    await queryRunner.query(`
      ALTER TABLE "agency_documents"
        ADD CONSTRAINT "agency_documents_agencyId_fkey"
        FOREIGN KEY ("agencyId") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agency_documents" DROP CONSTRAINT IF EXISTS "agency_documents_agencyId_fkey"`,
    );
    await queryRunner.query(`
      ALTER TABLE "agency_documents"
        ADD CONSTRAINT "agency_documents_agencyId_fkey"
        FOREIGN KEY ("agencyId") REFERENCES "agency_profiles"("userId")
        ON DELETE RESTRICT ON UPDATE CASCADE
    `);
  }
}
