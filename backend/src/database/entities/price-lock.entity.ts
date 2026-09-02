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
import { CabinClass, PriceLockStatus } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { Booking } from './booking.entity';
import { FlightInstance } from './flight-instance.entity';
import { User } from './user.entity';

@Index('price_locks_bookingId_key', ['bookingId'], { unique: true })
@Index('price_locks_flightInstanceId_cabin_status_idx', [
  'flightInstanceId',
  'cabin',
  'status',
])
@Index('price_locks_userId_status_idx', ['userId', 'status'])
@Entity('price_locks')
export class PriceLock {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'price_locks_pkey' })
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
    foreignKeyConstraintName: 'price_locks_userId_fkey',
  })
  user!: User;

  @Column({ type: 'text' })
  flightInstanceId!: string;

  @ManyToOne(() => FlightInstance, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'flightInstanceId',
    foreignKeyConstraintName: 'price_locks_flightInstanceId_fkey',
  })
  flightInstance!: FlightInstance;

  @Column({ type: 'enum', enum: CabinClass, enumName: 'CabinClass' })
  cabin!: CabinClass;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  lockedPriceIrr!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  feeIrr!: bigint;

  /** True once the fee was debited from the member wallet. */
  @Column({ type: 'boolean', default: false })
  feeCharged = false;

  @Column({
    type: 'enum',
    enum: PriceLockStatus,
    enumName: 'PriceLockStatus',
    default: PriceLockStatus.ACTIVE,
  })
  status!: PriceLockStatus;

  @Column({ type: 'timestamp', precision: 3 })
  expiresAt!: Date;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'text', nullable: true })
  bookingId!: string | null;

  @ManyToOne(() => Booking, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'bookingId',
    foreignKeyConstraintName: 'price_locks_bookingId_fkey',
  })
  booking!: Booking | null;
}
