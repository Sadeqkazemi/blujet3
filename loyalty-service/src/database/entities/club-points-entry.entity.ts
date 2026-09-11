import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { ClubPointsEntryType } from '../loyalty.enums';
import { ClubMember } from './club-member.entity';

@Index('club_points_entries_clubMemberId_idx', ['clubMemberId'])
@Check('club_points_entries_version_check', '"version" > 0')
@Entity('club_points_entries', { schema: 'loyalty' })
export class ClubPointsEntry {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'club_points_entries_pkey',
  })
  id!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'text' })
  clubMemberId!: string;

  @ManyToOne(() => ClubMember, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'clubMemberId',
    foreignKeyConstraintName: 'club_points_entries_clubMemberId_fkey',
  })
  clubMember!: ClubMember;

  @Column({
    type: 'enum',
    enum: ClubPointsEntryType,
    enumName: 'ClubPointsEntryType',
  })
  type!: ClubPointsEntryType;

  @Column({ type: 'int' })
  signedPoints!: number;

  @Column({ type: 'text', nullable: true })
  bookingId!: string | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3, default: () => 'now()' })
  createdAt!: Date;
}
