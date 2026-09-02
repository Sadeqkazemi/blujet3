import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobPostingImageDescription1785833148936 implements MigrationInterface {
  name = 'JobPostingImageDescription1785833148936';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_postings" ADD "description" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_postings" ADD "imageFileId" text`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "job_postings_imageFileId_key" ON "job_postings"  ("imageFileId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_postings" DROP CONSTRAINT "job_postings_imageFileId_fkey"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."job_postings_imageFileId_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_postings" DROP COLUMN "imageFileId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_postings" DROP COLUMN "description"`,
    );
  }
}
