import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReportingKafkaFailureQuarantine1792329600000 implements MigrationInterface {
  name = 'ReportingKafkaFailureQuarantine1792329600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA IF NOT EXISTS "reporting"');
    await queryRunner.query(`CREATE TABLE "reporting"."kafka_processing_failures" (
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
      "firstFailedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
      "lastFailedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
      "quarantinedAt" TIMESTAMP(3) WITH TIME ZONE,
      "approvedBy" character varying(128),
      "approvalReason" character varying(500),
      "approvedAt" TIMESTAMP(3) WITH TIME ZONE,
      "resolvedAt" TIMESTAMP(3) WITH TIME ZONE,
      "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "reporting_kafka_processing_failures_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "reporting_kafka_failure_partition_check" CHECK ("partition" >= 0),
      CONSTRAINT "reporting_kafka_failure_offset_check" CHECK ("offset" >= 0),
      CONSTRAINT "reporting_kafka_failure_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 10),
      CONSTRAINT "reporting_kafka_failure_total_attempts_check" CHECK ("totalAttempts" >= "attempts"),
      CONSTRAINT "reporting_kafka_failure_stage_check" CHECK ("stage" IN ('TRANSPORT', 'PROJECTION')),
      CONSTRAINT "reporting_kafka_failure_status_check" CHECK ("status" IN ('RETRYING', 'QUARANTINED', 'RETRY_APPROVED', 'SKIP_APPROVED', 'RESOLVED', 'SKIPPED'))
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "reporting_kafka_failure_delivery_key"
      ON "reporting"."kafka_processing_failures" ("consumerGroup", "topic", "partition", "offset")`);
    await queryRunner.query(`CREATE INDEX "reporting_kafka_failure_status_lastFailedAt_idx"
      ON "reporting"."kafka_processing_failures" ("status", "lastFailedAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "reporting"."kafka_processing_failures"',
    );
  }
}
