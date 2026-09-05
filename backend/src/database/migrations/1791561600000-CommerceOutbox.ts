import { MigrationInterface, QueryRunner } from 'typeorm';

// Generated from CommerceOutboxEvent using TypeORM's schema builder; expand only.
export class CommerceOutbox1791561600000 implements MigrationInterface {
  name = 'CommerceOutbox1791561600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "orders"."commerce_outbox_events" (
      "id" text NOT NULL, "producer" text NOT NULL, "idempotencyKey" text NOT NULL,
      "fingerprint" text NOT NULL, "envelopeEncrypted" text NOT NULL,
      "attempts" integer NOT NULL DEFAULT '0',
      "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      "claimedAt" TIMESTAMP(3), "claimToken" text, "deliveredAt" TIMESTAMP(3),
      "deadLetterAt" TIMESTAMP(3), "lastError" text,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
      CONSTRAINT "commerce_outbox_events_pkey" PRIMARY KEY ("id"))`);
    await queryRunner.query(
      `CREATE INDEX "commerce_outbox_delivery_idx" ON "orders"."commerce_outbox_events" ("deliveredAt", "deadLetterAt", "nextAttemptAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "commerce_outbox_idempotency_key" ON "orders"."commerce_outbox_events" ("producer", "idempotencyKey")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "orders"."commerce_outbox_events"');
  }
}
