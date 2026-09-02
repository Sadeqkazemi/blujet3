import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { BankLoanStatus } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import type { JsonValue } from '../json-types';
import { User } from './user.entity';

@Index(
  'bank_loan_applications_userId_idempotencyKey_key',
  ['userId', 'idempotencyKey'],
  { unique: true },
)
@Unique('bank_loan_applications_bankReferenceId_key', ['bankReferenceId'])
@Index(
  'bank_loan_applications_walletCreditReference_key',
  ['walletCreditReference'],
  {
    unique: true,
    where: '"walletCreditReference" IS NOT NULL',
  },
)
@Index('bank_loan_applications_userId_createdAt_idx', ['userId', 'createdAt'])
@Index('bank_loan_applications_initiationLeaseUntil_idx', ['initiationLeaseUntil'])
@Entity('bank_loan_applications')
export class BankLoanApplication {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'bank_loan_applications_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'bank_loan_applications_userId_fkey',
  })
  user!: User;

  @Column({ type: 'text' })
  idempotencyKey!: string;

  /** Opaque bank reference — authoritative identity at the bank. */
  @Column({ type: 'text', nullable: true })
  bankReferenceId!: string | null;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  requestedAmountIrr!: bigint;

  @Column({
    type: 'enum',
    enum: BankLoanStatus,
    enumName: 'BankLoanStatus',
    default: BankLoanStatus.SUBMITTED,
  })
  bankStatus!: BankLoanStatus;

  /** Last non-sensitive summary from bank (no tokens / PAN / full payloads). */
  @Column({ type: 'jsonb', nullable: true })
  statusSummary!: JsonValue | null;

  @Column({ type: 'text', nullable: true })
  lastWebhookEventId!: string | null;

  /** Bank-reported time of the last applied webhook (replay protection). */
  @Column({ type: 'timestamp', precision: 3, nullable: true })
  lastWebhookOccurredAt!: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  lastSyncedAt!: Date | null;

  /** Unique bank disbursement reference when wallet credit was applied. */
  @Column({ type: 'text', nullable: true })
  walletCreditReference!: string | null;

  /** When local bank-create initiation began (INITIATING). */
  @Column({ type: 'timestamp', precision: 3, nullable: true })
  initiationStartedAt!: Date | null;

  /** Soft lease: another request may reclaim after this instant. */
  @Column({ type: 'timestamp', precision: 3, nullable: true })
  initiationLeaseUntil!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
