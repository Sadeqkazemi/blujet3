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
import type { JsonValue } from '../json-types';
import { ManagerReferral } from './manager-referral.entity';
import { User } from './user.entity';

@Index('manager_referral_reports_referralId_idx', ['referralId'])
@Entity('manager_referral_reports')
export class ManagerReferralReport {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'manager_referral_reports_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  referralId!: string;

  @ManyToOne(() => ManagerReferral, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'referralId',
    foreignKeyConstraintName: 'manager_referral_reports_referralId_fkey',
  })
  referral!: ManagerReferral;

  @Column({ type: 'text' })
  fromId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'fromId',
    foreignKeyConstraintName: 'manager_referral_reports_fromId_fkey',
  })
  from!: User;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments!: JsonValue | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
