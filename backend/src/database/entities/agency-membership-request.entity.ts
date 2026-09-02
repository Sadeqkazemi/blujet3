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
import { AgencyMembershipStatus } from '../enums';
import type { JsonValue } from '../json-types';
import { User } from './user.entity';

@Index('agency_membership_requests_status_idx', ['status'])
@Entity('agency_membership_requests')
export class AgencyMembershipRequest {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_membership_requests_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  applicantName!: string;

  @Column({ type: 'text' })
  managerName!: string;

  @Column({ type: 'text' })
  licenseNo!: string;

  @Column({ type: 'text', nullable: true })
  city!: string | null;

  @Column({ type: 'text' })
  phone!: string;

  @Column({ type: 'text', nullable: true })
  email!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  documents!: JsonValue | null;

  @Column({
    type: 'enum',
    enum: AgencyMembershipStatus,
    enumName: 'AgencyMembershipStatus',
    default: AgencyMembershipStatus.PENDING,
  })
  status!: AgencyMembershipStatus;

  @Column({ type: 'text', nullable: true })
  referredToId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'referredToId',
    foreignKeyConstraintName: 'agency_membership_requests_referredToId_fkey',
  })
  referredTo!: User | null;

  @Column({ type: 'text', nullable: true })
  reviewNote!: string | null;

  @Column({ type: 'text', nullable: true })
  commercialApprovedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'commercialApprovedById',
    foreignKeyConstraintName:
      'agency_membership_requests_commercialApprovedById_fkey',
  })
  commercialApprovedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  commercialApprovedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  financeApprovedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'financeApprovedById',
    foreignKeyConstraintName:
      'agency_membership_requests_financeApprovedById_fkey',
  })
  financeApprovedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  financeApprovedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'reviewedById',
    foreignKeyConstraintName: 'agency_membership_requests_reviewedById_fkey',
  })
  reviewedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
