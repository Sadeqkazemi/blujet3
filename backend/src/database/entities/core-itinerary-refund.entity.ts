import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../transformers/bigint.transformer';
import type { JsonValue } from '../json-types';
import { CoreItineraryOrder } from './core-itinerary-order.entity';
import { LedgerEntry } from './ledger-entry.entity';
import { User } from './user.entity';

export type CoreItineraryRefundStatus =
  'RECEIVED' | 'COMPLETED' | 'REVIEW_REQUIRED';

@Entity('core_itinerary_refunds', { schema: 'payments' })
@Index('core_itinerary_refunds_idempotencyKey_key', ['idempotencyKey'], {
  unique: true,
})
@Index('core_itinerary_refunds_refundReference_key', ['refundReference'], {
  unique: true,
})
@Index('core_itinerary_refunds_ledgerEntryId_key', ['ledgerEntryId'], {
  unique: true,
})
@Index('core_itinerary_refunds_orderId_idx', ['orderId'])
@Check(
  'core_itinerary_refunds_status_check',
  `"status" IN ('RECEIVED', 'COMPLETED', 'REVIEW_REQUIRED')`,
)
@Check(
  'core_itinerary_refunds_amount_check',
  `"grossAmountIrr" > 0 AND "penaltyAmountIrr" >= 0 AND "refundableIrr" > 0 AND "grossAmountIrr" = "penaltyAmountIrr" + "refundableIrr"`,
)
@Check(
  'core_itinerary_refunds_failure_check',
  `("status" = 'REVIEW_REQUIRED' AND "failureCode" IS NOT NULL) OR ("status" != 'REVIEW_REQUIRED' AND "failureCode" IS NULL)`,
)
@Check(
  'core_itinerary_refunds_ledger_check',
  `("status" = 'COMPLETED' AND "ledgerEntryId" IS NOT NULL) OR ("status" != 'COMPLETED' AND "ledgerEntryId" IS NULL)`,
)
export class CoreItineraryRefund {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'core_itinerary_refunds_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  orderId!: string;

  @ManyToOne(() => CoreItineraryOrder, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'orderId',
    foreignKeyConstraintName: 'core_itinerary_refunds_orderId_fkey',
  })
  order!: CoreItineraryOrder;

  @Column({ type: 'text' })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'ownerId',
    foreignKeyConstraintName: 'core_itinerary_refunds_ownerId_fkey',
  })
  owner!: User;

  @Column({ type: 'text' })
  idempotencyKey!: string;

  @Column({ type: 'text', select: false })
  requestHash!: string;

  @Column({ type: 'text' })
  quoteReference!: string;

  @Column({ type: 'text' })
  refundReference!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  grossAmountIrr!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  penaltyAmountIrr!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  refundableIrr!: bigint;

  @Column({ type: 'jsonb' })
  quoteSnapshot!: JsonValue;

  @Column({ type: 'text', default: 'IRR' })
  currency!: 'IRR';

  @Column({ type: 'text', default: 'RECEIVED' })
  status!: CoreItineraryRefundStatus;

  @Column({ type: 'text', nullable: true })
  failureCode!: string | null;

  @Column({ type: 'text', nullable: true })
  ledgerEntryId!: string | null;

  @ManyToOne(() => LedgerEntry, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'ledgerEntryId',
    foreignKeyConstraintName: 'core_itinerary_refunds_ledgerEntryId_fkey',
  })
  ledgerEntry!: LedgerEntry | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
