import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { CabinClass, PriceLockStatus } from '../loyalty.enums';
import {
  CabinClass as Cabin,
  PriceLockStatus as LockStatus,
} from '../loyalty.enums';

@Index('price_locks_bookingId_key', ['bookingId'], { unique: true })
@Index('price_locks_flightInstanceId_cabin_status_idx', [
  'flightInstanceId',
  'cabin',
  'status',
])
@Index('price_locks_userId_status_idx', ['userId', 'status'])
@Entity('price_locks', { schema: 'loyalty' })
export class PriceLock {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'price_locks_pkey' })
  id!: string;

  @Column({ type: 'text' })
  userId!: string;

  @Column({ type: 'text' })
  flightInstanceId!: string;

  @Column({ type: 'enum', enum: Cabin, enumName: 'CabinClass' })
  cabin!: CabinClass;

  @Column({ type: 'bigint' })
  lockedPriceIrr!: string;

  @Column({ type: 'bigint' })
  feeIrr!: string;

  @Column({ type: 'boolean', default: false })
  feeCharged!: boolean;

  @Column({
    type: 'enum',
    enum: LockStatus,
    enumName: 'PriceLockStatus',
    default: LockStatus.ACTIVE,
  })
  status!: PriceLockStatus;

  @Column({ type: 'timestamp', precision: 3 })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamp', precision: 3, default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'text', nullable: true })
  bookingId!: string | null;
}
