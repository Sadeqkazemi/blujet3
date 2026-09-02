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
import { ClubPointsEntryType } from '../enums';
import { Booking } from './booking.entity';
import { ClubMember } from './club-member.entity';

@Index('club_points_entries_clubMemberId_idx', ['clubMemberId'])
@Entity('club_points_entries')
export class ClubPointsEntry {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'club_points_entries_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

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

  @ManyToOne(() => Booking, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'bookingId',
    foreignKeyConstraintName: 'club_points_entries_bookingId_fkey',
  })
  booking!: Booking | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
