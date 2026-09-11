import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { CustomerReferralStatus } from '../loyalty.enums';
import { CustomerReferralStatus as ReferralStatus } from '../loyalty.enums';

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
@Check('customer_referrals_version_check', '"version" > 0')
@Entity('customer_referrals', { schema: 'loyalty' })
export class CustomerReferral {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'customer_referrals_pkey',
  })
  id!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'text' })
  referrerUserId!: string;

  @Column({ type: 'text' })
  referredUserId!: string;

  @Column({
    type: 'enum',
    enum: ReferralStatus,
    enumName: 'CustomerReferralStatus',
    default: ReferralStatus.SIGNED_UP,
  })
  status!: CustomerReferralStatus;

  @Column({ type: 'int', default: 0 })
  pointsAwarded!: number;

  @Column({ type: 'text', nullable: true })
  firstBookingId!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  rewardedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3, default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
