import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { ClubCardStatus, ClubTier } from '../loyalty.enums';

@Index('club_members_level_idx', ['level'])
@Index('club_members_nationalIdHash_idx', ['nationalIdHash'])
@Index('club_members_userId_key', ['userId'], { unique: true })
@Index('club_members_deactivatedAt_idx', ['deactivatedAt'])
@Check('club_members_version_check', '"version" > 0')
@Entity('club_members', { schema: 'loyalty' })
export class ClubMember {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'club_members_pkey',
  })
  id!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'text', nullable: true })
  userId!: string | null;

  @Column({ type: 'text' })
  fullName!: string;

  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  birthDate!: Date | null;

  @Column({ type: 'text' })
  nationalIdEnc!: string;

  @Column({ type: 'text' })
  nationalIdHash!: string;

  @CreateDateColumn({ type: 'timestamp', precision: 3, default: () => 'now()' })
  joinDate!: Date;

  @Column({ type: 'int', default: 0 })
  points!: number;

  @Column({
    type: 'enum',
    enum: ClubTier,
    enumName: 'ClubTier',
    default: ClubTier.SILVER,
  })
  level!: ClubTier;

  @Column({
    type: 'enum',
    enum: ClubCardStatus,
    enumName: 'ClubCardStatus',
    default: ClubCardStatus.NONE,
  })
  cardStatus!: ClubCardStatus;

  @Column({ type: 'text', nullable: true })
  cardNo!: string | null;

  @Column({ type: 'text', nullable: true })
  issuedByLabelFa!: string | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3, default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  deactivatedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  deactivatedById!: string | null;
}
