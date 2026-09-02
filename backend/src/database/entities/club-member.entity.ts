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
import { ClubCardStatus, ClubTier } from '../enums';
import { User } from './user.entity';

@Index('club_members_level_idx', ['level'])
@Index('club_members_nationalIdHash_idx', ['nationalIdHash'])
@Index('club_members_userId_key', ['userId'], { unique: true })
@Index('club_members_deactivatedAt_idx', ['deactivatedAt'])
@Entity('club_members')
export class ClubMember {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'club_members_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'club_members_userId_fkey',
  })
  user!: User | null;

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

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
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

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  /** Deactivation suspends benefits while keeping every historical relation intact. */
  @Column({ type: 'timestamp', precision: 3, nullable: true })
  deactivatedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  deactivatedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'deactivatedById',
    foreignKeyConstraintName: 'club_members_deactivatedById_fkey',
  })
  deactivatedBy!: User | null;
}
