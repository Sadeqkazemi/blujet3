import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const LoyaltyKafkaFailureStage = {
  TRANSPORT: 'TRANSPORT',
  PROJECTION: 'PROJECTION',
} as const;
export type LoyaltyKafkaFailureStage =
  (typeof LoyaltyKafkaFailureStage)[keyof typeof LoyaltyKafkaFailureStage];

export const LoyaltyKafkaFailureStatus = {
  RETRYING: 'RETRYING',
  QUARANTINED: 'QUARANTINED',
  RETRY_APPROVED: 'RETRY_APPROVED',
  SKIP_APPROVED: 'SKIP_APPROVED',
  RESOLVED: 'RESOLVED',
  SKIPPED: 'SKIPPED',
} as const;
export type LoyaltyKafkaFailureStatus =
  (typeof LoyaltyKafkaFailureStatus)[keyof typeof LoyaltyKafkaFailureStatus];

@Entity('kafka_processing_failures', { schema: 'loyalty' })
@Index(
  'loyalty_kafka_failure_delivery_key',
  ['consumerGroup', 'topic', 'partition', 'offset'],
  { unique: true },
)
@Index('loyalty_kafka_failure_status_lastFailedAt_idx', [
  'status',
  'lastFailedAt',
])
@Check('loyalty_kafka_failure_partition_check', '"partition" >= 0')
@Check('loyalty_kafka_failure_offset_check', '"offset" >= 0')
@Check(
  'loyalty_kafka_failure_attempts_check',
  '"attempts" >= 0 AND "attempts" <= 10',
)
@Check(
  'loyalty_kafka_failure_total_attempts_check',
  '"totalAttempts" >= "attempts"',
)
@Check(
  'loyalty_kafka_failure_stage_check',
  "\"stage\" IN ('TRANSPORT', 'PROJECTION')",
)
@Check(
  'loyalty_kafka_failure_status_check',
  "\"status\" IN ('RETRYING', 'QUARANTINED', 'RETRY_APPROVED', 'SKIP_APPROVED', 'RESOLVED', 'SKIPPED')",
)
export class LoyaltyKafkaProcessingFailure {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'loyalty_kafka_processing_failures_pkey',
  })
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  consumerGroup!: string;

  @Column({ type: 'varchar', length: 249 })
  topic!: string;

  @Column({ type: 'int' })
  partition!: number;

  @Column({ type: 'bigint' })
  offset!: string;

  @Column({ type: 'char', length: 64 })
  fingerprint!: string;

  @Column({ type: 'uuid', nullable: true })
  eventId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  stage!: LoyaltyKafkaFailureStage;

  @Column({ type: 'smallint' })
  attempts!: number;

  @Column({ type: 'int' })
  totalAttempts!: number;

  @Column({ type: 'varchar', length: 20 })
  status!: LoyaltyKafkaFailureStatus;

  @Column({ type: 'timestamptz', precision: 3 })
  firstFailedAt!: Date;

  @Column({ type: 'timestamptz', precision: 3 })
  lastFailedAt!: Date;

  @Column({ type: 'timestamptz', precision: 3, nullable: true })
  quarantinedAt!: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  approvedBy!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  approvalReason!: string | null;

  @Column({ type: 'timestamptz', precision: 3, nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'timestamptz', precision: 3, nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
    default: () => 'now()',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    precision: 3,
    default: () => 'now()',
  })
  updatedAt!: Date;
}
