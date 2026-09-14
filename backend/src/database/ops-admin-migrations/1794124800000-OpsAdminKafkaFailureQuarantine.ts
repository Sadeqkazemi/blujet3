import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OpsAdminKafkaFailureQuarantine1794124800000 implements MigrationInterface {
  public readonly name = 'OpsAdminKafkaFailureQuarantine1794124800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "ops"."kafka_processing_failures" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "consumerGroup" character varying(128) NOT NULL,
      "topic" character varying(249) NOT NULL,
      "partition" integer NOT NULL,
      "offset" bigint NOT NULL,
      "fingerprint" character(64) NOT NULL,
      "eventId" uuid,
      "stage" character varying(16) NOT NULL,
      "attempts" smallint NOT NULL,
      "totalAttempts" integer NOT NULL,
      "status" character varying(20) NOT NULL,
      "firstFailedAt" timestamptz(3) NOT NULL,
      "lastFailedAt" timestamptz(3) NOT NULL,
      "quarantinedAt" timestamptz(3),
      "approvedBy" character varying(128),
      "approvalReason" character varying(64),
      "approvedAt" timestamptz(3),
      "resolvedAt" timestamptz(3),
      "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
      "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT "ops_admin_kafka_processing_failures_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ops_admin_kafka_failure_partition_check" CHECK ("partition" >= 0),
      CONSTRAINT "ops_admin_kafka_failure_offset_check" CHECK ("offset" >= 0),
      CONSTRAINT "ops_admin_kafka_failure_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 10),
      CONSTRAINT "ops_admin_kafka_failure_total_attempts_check" CHECK ("totalAttempts" >= "attempts"),
      CONSTRAINT "ops_admin_kafka_failure_stage_check" CHECK ("stage" IN ('TRANSPORT', 'PROJECTION')),
      CONSTRAINT "ops_admin_kafka_failure_status_check" CHECK ("status" IN ('RETRYING', 'QUARANTINED', 'RETRY_APPROVED', 'SKIP_APPROVED', 'RESOLVED', 'SKIPPED')),
      CONSTRAINT "ops_admin_kafka_failure_approval_reason_check" CHECK ("approvalReason" IS NULL OR "approvalReason" IN ('TRANSIENT_DEPENDENCY_RECOVERED', 'PROJECTION_FIX_DEPLOYED', 'SCHEMA_COMPATIBILITY_CONFIRMED', 'MESSAGE_REJECTED_AFTER_REVIEW', 'DUPLICATE_DELIVERY_CONFIRMED'))
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "ops_admin_kafka_failure_delivery_key"
      ON "ops"."kafka_processing_failures" ("consumerGroup", "topic", "partition", "offset")`);
    await queryRunner.query(`CREATE INDEX "ops_admin_kafka_failure_status_lastFailedAt_idx"
      ON "ops"."kafka_processing_failures" ("status", "lastFailedAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "ops"."kafka_processing_failures"');
  }
}
