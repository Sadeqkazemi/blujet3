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
import { CustomerReferralStatus } from '../enums';
import { Booking } from './booking.entity';
import { User } from './user.entity';

@Index('customer_referrals_firstBookingId_key', ['firstBookingId'], {
  unique: true,
})
@Index('customer_referrals_referredUserId_key', ['referredUserId'], {
  unique: true,
})
@Index('customer_referrals_referrerUserId_createdAt_idx', [
  'referrerUserId',
  'createdAt',
])
@Entity('customer_referrals')
export class CustomerReferral {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'customer_referrals_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  referrerUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'referrerUserId',
    foreignKeyConstraintName: 'customer_referrals_referrerUserId_fkey',
  })
  referrer!: User;

  @Column({ type: 'text' })
  referredUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'referredUserId',
    foreignKeyConstraintName: 'customer_referrals_referredUserId_fkey',
  })
  referred!: User;

  @Column({
    type: 'enum',
    enum: CustomerReferralStatus,
    enumName: 'CustomerReferralStatus',
    default: CustomerReferralStatus.SIGNED_UP,
  })
  status!: CustomerReferralStatus;

  @Column({ type: 'int', default: 0 })
  pointsAwarded!: number;

  @Column({ type: 'text', nullable: true })
  firstBookingId!: string | null;

  @ManyToOne(() => Booking, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'firstBookingId',
    foreignKeyConstraintName: 'customer_referrals_firstBookingId_fkey',
  })
  firstBooking!: Booking | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  rewardedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
