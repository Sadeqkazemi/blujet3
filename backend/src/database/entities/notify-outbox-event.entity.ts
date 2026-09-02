import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { NotifyOutboxEventType } from '../../modules/notify-outbox/notify-outbox.contract';

@Index('notify_outbox_events_delivery_idx', ['deliveredAt', 'nextAttemptAt'])
@Index('notify_outbox_events_dedupeKey_key', ['dedupeKey'], { unique: true })
@Entity('notify_outbox_events', { schema: 'ops' })
export class NotifyOutboxEvent {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'notify_outbox_events_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  eventType!: NotifyOutboxEventType;

  @Column({ type: 'text' })
  payloadEncrypted!: string;

  @Column({ type: 'text' })
  dedupeKey!: string;

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

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
