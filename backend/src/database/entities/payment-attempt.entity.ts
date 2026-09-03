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
import { Booking } from './booking.entity';
import { User } from './user.entity';

export type PaymentAttemptStatus =
  'REQUESTING' | 'UNKNOWN' | 'VERIFIED' | 'COMPLETED' | 'FAILED';

@Entity('payment_attempts', { schema: 'payments' })
@Index('payment_attempts_idempotencyKey_key', ['idempotencyKey'], {
  unique: true,
})
@Index('payment_attempts_active_booking_key', ['bookingId'], {
  unique: true,
  where: `"status" <> 'FAILED'`,
})
@Index('payment_attempts_status_createdAt_idx', ['status', 'createdAt'])
@Check(
  'payment_attempts_status_check',
  `"status" IN ('REQUESTING', 'UNKNOWN', 'VERIFIED', 'COMPLETED', 'FAILED')`,
)
@Check('payment_attempts_amount_check', '"amountIrr" >= 0')
export class PaymentAttempt {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'payment_attempts_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  bookingId!: string;

  @ManyToOne(() => Booking, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'bookingId',
    foreignKeyConstraintName: 'payment_attempts_bookingId_fkey',
  })
  booking!: Booking;

  @Column({ type: 'text' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'payment_attempts_userId_fkey',
  })
  user!: User;

  @Column({ type: 'text', nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'text', select: false })
  requestHash!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amountIrr!: bigint;

  @Column({ type: 'text', default: 'REQUESTING' })
  status!: PaymentAttemptStatus;

  @Column({ type: 'text', nullable: true, select: false })
  authority!: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  gatewayRefId!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
