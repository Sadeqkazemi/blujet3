import {
  Check,
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('kafka_consumer_checkpoints', { schema: 'loyalty' })
@Check('loyalty_kafka_checkpoint_partition_check', '"partition" >= 0')
@Check('loyalty_kafka_checkpoint_offset_check', '"nextOffset" >= 0')
@Check(
  'loyalty_kafka_checkpoint_high_watermark_check',
  '"highWatermark" IS NULL OR "highWatermark" >= 0',
)
export class LoyaltyKafkaConsumerCheckpoint {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  consumerGroup!: string;

  @PrimaryColumn({ type: 'varchar', length: 249 })
  topic!: string;

  @PrimaryColumn({ type: 'int' })
  partition!: number;

  @Column({ type: 'bigint' })
  nextOffset!: string;

  @Column({ type: 'bigint', nullable: true })
  highWatermark!: string | null;

  @UpdateDateColumn({
    type: 'timestamptz',
    precision: 3,
    default: () => 'now()',
  })
  updatedAt!: Date;
}
