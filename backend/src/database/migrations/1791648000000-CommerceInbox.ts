import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommerceInbox1791648000000 implements MigrationInterface {
  name = 'CommerceInbox1791648000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "orders"."commerce_inbox_receipts" (
      "consumer" character varying(128) NOT NULL,
      "eventId" uuid NOT NULL,
      "fingerprint" character varying(64) NOT NULL,
      "receivedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "commerce_inbox_receipts_pkey" PRIMARY KEY ("consumer", "eventId"))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "orders"."commerce_inbox_receipts"');
  }
}
