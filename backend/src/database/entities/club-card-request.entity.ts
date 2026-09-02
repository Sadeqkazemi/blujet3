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
import { ClubCardAssignee, ClubCardRequestStatus, ClubTier } from '../enums';
import type { JsonValue } from '../json-types';
import { ClubMember } from './club-member.entity';
import { User } from './user.entity';

@Index('club_card_requests_status_idx', ['status'])
@Entity('club_card_requests')
export class ClubCardRequest {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'club_card_requests_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  memberId!: string;

  @ManyToOne(() => ClubMember, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'memberId',
    foreignKeyConstraintName: 'club_card_requests_memberId_fkey',
  })
  member!: ClubMember;

  @Column({ type: 'enum', enum: ClubTier, enumName: 'ClubTier' })
  level!: ClubTier;

  @Column({ type: 'int' })
  points!: number;

  @Column({
    type: 'enum',
    enum: ClubCardRequestStatus,
    enumName: 'ClubCardRequestStatus',
    default: ClubCardRequestStatus.SUBMITTED,
  })
  status!: ClubCardRequestStatus;

  @Column({
    type: 'enum',
    enum: ClubCardAssignee,
    enumName: 'ClubCardAssignee',
    nullable: true,
  })
  assignedTo!: ClubCardAssignee | null;

  @Column({ type: 'text', nullable: true })
  decidedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'decidedById',
    foreignKeyConstraintName: 'club_card_requests_decidedById_fkey',
  })
  decidedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  decidedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  cardNo!: string | null;

  @Column({ type: 'jsonb' })
  history!: JsonValue;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
