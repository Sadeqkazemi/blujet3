import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('kafka_consumer_checkpoints', { schema: 'reporting' })
export class ReportingKafkaConsumerCheckpoint {
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
