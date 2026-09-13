import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AgencyKafkaConsumerCheckpoints1793952000000 implements MigrationInterface {
  public readonly name = 'AgencyKafkaConsumerCheckpoints1793952000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "agency"."kafka_consumer_checkpoints" (
      "consumerGroup" character varying(128) NOT NULL,
      "topic" character varying(249) NOT NULL,
      "partition" integer NOT NULL,
      "nextOffset" bigint NOT NULL,
      "highWatermark" bigint,
      "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT "agency_kafka_consumer_checkpoints_pkey" PRIMARY KEY ("consumerGroup", "topic", "partition"),
      CONSTRAINT "agency_kafka_checkpoint_partition_check" CHECK ("partition" >= 0),
      CONSTRAINT "agency_kafka_checkpoint_offset_check" CHECK ("nextOffset" >= 0),
      CONSTRAINT "agency_kafka_checkpoint_high_watermark_check" CHECK ("highWatermark" IS NULL OR "highWatermark" >= 0)
    )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "agency"."kafka_consumer_checkpoints"');
  }
}
