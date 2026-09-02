import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportTicketAttachments1789219200000 implements MigrationInterface {
  name = 'SupportTicketAttachments1789219200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "support_tickets" ADD "attachments" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "support_tickets" DROP COLUMN "attachments"`,
    );
  }
}
