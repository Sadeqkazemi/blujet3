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
import { PaymentReconciliationStatus } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { Booking } from './booking.entity';
import { User } from './user.entity';

@Index('payment_reconciliations_status_idx', ['status'])
@Entity('payment_reconciliations')
export class PaymentReconciliation {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'payment_reconciliations_pkey',
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
    foreignKeyConstraintName: 'payment_reconciliations_bookingId_fkey',
  })
  booking!: Booking;

  @Column({ type: 'text' })
  gatewayRefId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amountIrr!: bigint;

  @Column({
    type: 'enum',
    enum: PaymentReconciliationStatus,
    enumName: 'PaymentReconciliationStatus',
    default: PaymentReconciliationStatus.PENDING,
  })
  status!: PaymentReconciliationStatus;

  @Column({ type: 'text', nullable: true })
  resolvedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'resolvedById',
    foreignKeyConstraintName: 'payment_reconciliations_resolvedById_fkey',
  })
  resolvedBy!: User | null;

  @Column({ type: 'text', nullable: true })
  resolutionNote!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
