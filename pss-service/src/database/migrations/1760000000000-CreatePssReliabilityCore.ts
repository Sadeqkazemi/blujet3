import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePssReliabilityCore1760000000000 implements MigrationInterface {
  name = 'CreatePssReliabilityCore1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pss_idempotency_records" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "caller" varchar(120) NOT NULL,
        "operation" varchar(120) NOT NULL,
        "key" varchar(200) NOT NULL,
        "request_digest" char(64) NOT NULL,
        "state" varchar(20) NOT NULL DEFAULT 'COMPLETED',
        "response_payload" jsonb NOT NULL,
        "response_reference" varchar(200),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        CONSTRAINT "pk_pss_idempotency_records" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "uq_pss_idempotency_caller_operation_key" ON "pss_idempotency_records" ("caller", "operation", "key")',
    );
    await queryRunner.query(`
      CREATE TABLE "pss_outbox_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "aggregate_type" varchar(80) NOT NULL,
        "aggregate_id" varchar(120) NOT NULL,
        "event_type" varchar(120) NOT NULL,
        "payload" jsonb NOT NULL,
        "payload_version" smallint NOT NULL DEFAULT 1,
        "attempts" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "available_at" timestamptz NOT NULL DEFAULT now(),
        "published_at" timestamptz,
        "dead_lettered_at" timestamptz,
        CONSTRAINT "pk_pss_outbox_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_pss_outbox_unpublished" ON "pss_outbox_events" ("published_at", "created_at")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "pss_outbox_events"');
    await queryRunner.query('DROP TABLE "pss_idempotency_records"');
  }
}
