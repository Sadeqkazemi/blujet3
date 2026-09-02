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
} from 'typeorm';
import { RefundStatus } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import type { JsonValue } from '../json-types';
import { Booking } from './booking.entity';
import { User } from './user.entity';

@Index('refund_requests_bookingId_key', ['bookingId'], { unique: true })
@Index('refund_requests_status_idx', ['status'])
@Index('refund_requests_trackingCode_key', ['trackingCode'], { unique: true })
@Entity('refund_requests')
export class RefundRequest {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'refund_requests_pkey',
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
    foreignKeyConstraintName: 'refund_requests_bookingId_fkey',
  })
  booking!: Booking;

  @Column({ type: 'text' })
  passengerName!: string;

  @Column({ type: 'text', nullable: true })
  nidEnc!: string | null;

  @Column({ type: 'text', nullable: true })
  mobileEnc!: string | null;

  @Column({ type: 'text' })
  ibanEnc!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  totalPaidIrr!: bigint;

  @Column({ type: 'int' })
  penaltyPct!: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  penaltyAmountIrr!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  refundableIrr!: bigint;

  @Column({
    type: 'enum',
    enum: RefundStatus,
    enumName: 'RefundStatus',
    default: RefundStatus.SUBMITTED,
  })
  status!: RefundStatus;

  @Column({ type: 'text', nullable: true })
  assigneeId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'assigneeId',
    foreignKeyConstraintName: 'refund_requests_assigneeId_fkey',
  })
  assignee!: User | null;

  @Column({ type: 'text', nullable: true })
  processedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'processedById',
    foreignKeyConstraintName: 'refund_requests_processedById_fkey',
  })
  processedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  paidAt!: Date | null;

  @Column({ type: 'jsonb' })
  history!: JsonValue;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'text' })
  trackingCode!: string;
}
