import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import type {
  ClubCardAssignee,
  ClubCardRequestStatus,
  ClubTier,
} from '../loyalty.enums';
import {
  ClubCardAssignee as Assignee,
  ClubCardRequestStatus as RequestStatus,
  ClubTier as Tier,
} from '../loyalty.enums';
import { ClubMember } from './club-member.entity';

@Index('club_card_requests_status_idx', ['status'])
@Entity('club_card_requests', { schema: 'loyalty' })
export class ClubCardRequest {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'club_card_requests_pkey',
  })
  id!: string;

  @Column({ type: 'text' })
  memberId!: string;

  @ManyToOne(() => ClubMember, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'memberId',
    foreignKeyConstraintName: 'club_card_requests_memberId_fkey',
  })
  member!: ClubMember;

  @Column({ type: 'enum', enum: Tier, enumName: 'ClubTier' })
  level!: ClubTier;

  @Column({ type: 'int' })
  points!: number;

  @Column({
    type: 'enum',
    enum: RequestStatus,
    enumName: 'ClubCardRequestStatus',
    default: RequestStatus.SUBMITTED,
  })
  status!: ClubCardRequestStatus;

  @Column({
    type: 'enum',
    enum: Assignee,
    enumName: 'ClubCardAssignee',
    nullable: true,
  })
  assignedTo!: ClubCardAssignee | null;

  @Column({ type: 'text', nullable: true })
  decidedById!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  decidedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  cardNo!: string | null;

  @Column({ type: 'jsonb' })
  history!: unknown;

  @CreateDateColumn({ type: 'timestamp', precision: 3, default: () => 'now()' })
  createdAt!: Date;
}
