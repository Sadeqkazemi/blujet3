import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('commerce_outbox_events', { schema: 'orders' })
@Index('commerce_outbox_idempotency_key', ['producer', 'idempotencyKey'], {
  unique: true,
})
@Index('commerce_outbox_delivery_idx', [
  'deliveredAt',
  'deadLetterAt',
  'nextAttemptAt',
])
export class CommerceOutboxEvent {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'commerce_outbox_events_pkey',
  })
  id!: string;
  @Column({ type: 'text' })
  producer!: string;
  @Column({ type: 'text' })
  idempotencyKey!: string;
  @Column({ type: 'text' })
  fingerprint!: string;
  @Column({ type: 'text' })
  envelopeEncrypted!: string;
  @Column({ type: 'int', default: 0 })
  attempts!: number;
  @Column({
    type: 'timestamp',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP',
  })
  nextAttemptAt!: Date;
  @Column({ type: 'timestamp', precision: 3, nullable: true })
  claimedAt!: Date | null;
  @Column({ type: 'text', nullable: true })
  claimToken!: string | null;
  @Column({ type: 'timestamp', precision: 3, nullable: true })
  deliveredAt!: Date | null;
  @Column({ type: 'timestamp', precision: 3, nullable: true })
  deadLetterAt!: Date | null;
  @Column({ type: 'text', nullable: true })
  lastError!: string | null;
  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
