import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { JsonValue } from '../json-types';

/**
 * Append-only bank webhook/event log. unique(provider, eventId) gives
 * idempotent ingestion; payloadRedacted never stores secrets/tokens.
 */
@Index(
  'bank_loan_webhook_events_provider_eventId_key',
  ['provider', 'eventId'],
  {
    unique: true,
  },
)
@Index('bank_loan_webhook_events_bankReferenceId_idx', ['bankReferenceId'])
@Entity('bank_loan_webhook_events')
export class BankLoanWebhookEvent {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'bank_loan_webhook_events_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  /** Configured bank provider key (never a secret) — e.g. hostname or env tag. */
  @Column({ type: 'text' })
  provider!: string;

  @Column({ type: 'text' })
  eventId!: string;

  @Column({ type: 'text', nullable: true })
  bankReferenceId!: string | null;

  @Column({ type: 'text', nullable: true })
  loanApplicationId!: string | null;

  @Column({ type: 'text', nullable: true })
  bankStatus!: string | null;

  /** Bank-reported event time when present; used for replay protection. */
  @Column({ type: 'timestamp', precision: 3, nullable: true })
  occurredAt!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  payloadRedacted!: JsonValue | null;

  @Column({ type: 'text', default: 'APPLIED' })
  processingResult!: string;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
