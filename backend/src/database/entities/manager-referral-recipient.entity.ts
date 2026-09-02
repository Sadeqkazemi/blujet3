import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ManagerReferral } from './manager-referral.entity';
import { User } from './user.entity';

@Index('manager_referral_recipients_recipientId_idx', ['recipientId'])
@Entity('manager_referral_recipients')
export class ManagerReferralRecipient {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'manager_referral_recipients_pkey',
  })
  referralId!: string;

  @ManyToOne(() => ManagerReferral, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'referralId',
    foreignKeyConstraintName: 'manager_referral_recipients_referralId_fkey',
  })
  referral!: ManagerReferral;

  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'manager_referral_recipients_pkey',
  })
  recipientId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'recipientId',
    foreignKeyConstraintName: 'manager_referral_recipients_recipientId_fkey',
  })
  recipient!: User;
}
