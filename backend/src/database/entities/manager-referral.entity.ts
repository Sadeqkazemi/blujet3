import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { ReferralPriority, ReferralStatus } from '../enums';
import type { JsonValue } from '../json-types';
import { ManagerReferralRecipient } from './manager-referral-recipient.entity';
import { User } from './user.entity';

@Index('manager_referrals_fromId_status_idx', ['fromId', 'status'])
@Entity('manager_referrals')
export class ManagerReferral {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'manager_referrals_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  fromId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'fromId',
    foreignKeyConstraintName: 'manager_referrals_fromId_fkey',
  })
  from!: User;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({
    type: 'enum',
    enum: ReferralPriority,
    enumName: 'ReferralPriority',
    default: ReferralPriority.MEDIUM,
  })
  priority!: ReferralPriority;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  dueAt!: Date | null;

  @Column({
    type: 'enum',
    enum: ReferralStatus,
    enumName: 'ReferralStatus',
    default: ReferralStatus.SENT,
  })
  status!: ReferralStatus;

  @Column({ type: 'jsonb', nullable: true })
  attachments!: JsonValue | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @OneToMany(() => ManagerReferralRecipient, (r) => r.referral)
  recipients!: ManagerReferralRecipient[];
}
