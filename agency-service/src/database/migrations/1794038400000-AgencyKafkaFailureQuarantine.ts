import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AgencyKafkaFailureQuarantine1794038400000 implements MigrationInterface {
  public readonly name = 'AgencyKafkaFailureQuarantine1794038400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "agency"."kafka_processing_failures" (
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
      "approvalReason" character varying(500),
      "approvedAt" timestamptz(3),
      "resolvedAt" timestamptz(3),
      "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
      "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT "agency_kafka_processing_failures_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "agency_kafka_failure_partition_check" CHECK ("partition" >= 0),
      CONSTRAINT "agency_kafka_failure_offset_check" CHECK ("offset" >= 0),
      CONSTRAINT "agency_kafka_failure_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 10),
      CONSTRAINT "agency_kafka_failure_total_attempts_check" CHECK ("totalAttempts" >= "attempts"),
      CONSTRAINT "agency_kafka_failure_stage_check" CHECK ("stage" IN ('TRANSPORT', 'PROJECTION')),
      CONSTRAINT "agency_kafka_failure_status_check" CHECK ("status" IN ('RETRYING', 'QUARANTINED', 'RETRY_APPROVED', 'SKIP_APPROVED', 'RESOLVED', 'SKIPPED'))
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "agency_kafka_failure_delivery_key"
      ON "agency"."kafka_processing_failures" ("consumerGroup", "topic", "partition", "offset")`);
    await queryRunner.query(`CREATE INDEX "agency_kafka_failure_status_lastFailedAt_idx"
      ON "agency"."kafka_processing_failures" ("status", "lastFailedAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "agency"."kafka_processing_failures"');
  }
}
