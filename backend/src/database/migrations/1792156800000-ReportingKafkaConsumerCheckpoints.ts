import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReportingKafkaConsumerCheckpoints1792156800000 implements MigrationInterface {
  name = 'ReportingKafkaConsumerCheckpoints1792156800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA IF NOT EXISTS "reporting"');
    await queryRunner.query(`CREATE TABLE "reporting"."kafka_consumer_checkpoints" (
      "consumerGroup" character varying(128) NOT NULL,
      "topic" character varying(249) NOT NULL,
      "partition" integer NOT NULL,
      "nextOffset" bigint NOT NULL,
      "highWatermark" bigint,
      "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "reporting_kafka_consumer_checkpoints_pkey" PRIMARY KEY ("consumerGroup", "topic", "partition"),
      CONSTRAINT "reporting_kafka_checkpoint_partition_check" CHECK ("partition" >= 0),
      CONSTRAINT "reporting_kafka_checkpoint_offset_check" CHECK ("nextOffset" >= 0),
      CONSTRAINT "reporting_kafka_checkpoint_high_watermark_check" CHECK ("highWatermark" IS NULL OR "highWatermark" >= 0)
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "reporting"."kafka_consumer_checkpoints"',
    );
  }
}
