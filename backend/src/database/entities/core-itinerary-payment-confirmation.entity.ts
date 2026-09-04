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
import { CoreItineraryOrder } from './core-itinerary-order.entity';
import { User } from './user.entity';

export type CoreItineraryPaymentConfirmationStatus =
  'RECEIVED' | 'COMPLETED' | 'REVIEW_REQUIRED';

@Entity('core_itinerary_payment_confirmations', { schema: 'payments' })
@Index('core_itinerary_payment_confirmations_orderId_key', ['orderId'], {
  unique: true,
})
@Index(
  'core_itinerary_payment_confirmations_idempotencyKey_key',
  ['idempotencyKey'],
  { unique: true },
)
@Index(
  'core_itinerary_payment_confirmations_paymentReference_key',
  ['paymentReference'],
  { unique: true },
)
@Check(
  'core_itinerary_payment_confirmations_status_check',
  `"status" IN ('RECEIVED', 'COMPLETED', 'REVIEW_REQUIRED')`,
)
@Check('core_itinerary_payment_confirmations_amount_check', `"amountIrr" > 0`)
@Check(
  'core_itinerary_payment_confirmations_failure_check',
  `("status" = 'REVIEW_REQUIRED' AND "failureCode" IS NOT NULL) OR ("status" != 'REVIEW_REQUIRED' AND "failureCode" IS NULL)`,
)
export class CoreItineraryPaymentConfirmation {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'core_itinerary_payment_confirmations_pkey',
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
    foreignKeyConstraintName:
      'core_itinerary_payment_confirmations_orderId_fkey',
  })
  order!: CoreItineraryOrder;

  @Column({ type: 'text' })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'ownerId',
    foreignKeyConstraintName:
      'core_itinerary_payment_confirmations_ownerId_fkey',
  })
  owner!: User;

  @Column({ type: 'text' })
  idempotencyKey!: string;

  @Column({ type: 'text', select: false })
  requestHash!: string;

  @Column({ type: 'text' })
  paymentReference!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amountIrr!: bigint;

  @Column({ type: 'text', default: 'IRR' })
  currency!: 'IRR';

  @Column({ type: 'text', default: 'RECEIVED' })
  status!: CoreItineraryPaymentConfirmationStatus;

  @Column({ type: 'text', nullable: true })
  failureCode!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
