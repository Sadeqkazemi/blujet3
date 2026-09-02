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
import { LockApprovalStatus, LockClassification, Role } from '../enums';
import { Booking } from './booking.entity';
import { FlightInstance } from './flight-instance.entity';
import { User } from './user.entity';
import { AgencyProfile } from './agency-profile.entity';

@Index('seat_locks_active_seat_unique', ['flightInstanceId', 'seatCode'], {
  unique: true,
  where: '"releasedAt" IS NULL',
})
@Index('seat_locks_bookingId_key', ['bookingId'], { unique: true })
@Index('seat_locks_flightInstanceId_idx', ['flightInstanceId'])
@Index('seat_locks_agencyId_idx', ['agencyId'])
@Entity('seat_locks')
export class SeatLock {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'seat_locks_pkey' })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  flightInstanceId!: string;

  @ManyToOne(() => FlightInstance, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'flightInstanceId',
    foreignKeyConstraintName: 'seat_locks_flightInstanceId_fkey',
  })
  flightInstance!: FlightInstance;

  @Column({ type: 'text' })
  seatCode!: string;

  @Column({ type: 'text' })
  lockedById!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'lockedById',
    foreignKeyConstraintName: 'seat_locks_lockedById_fkey',
  })
  lockedBy!: User;

  @Column({ type: 'text', nullable: true })
  agencyId!: string | null;

  @ManyToOne(() => AgencyProfile, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'agencyId',
    referencedColumnName: 'userId',
    foreignKeyConstraintName: 'seat_locks_agencyId_fkey',
  })
  agency!: AgencyProfile | null;

  @Column({ type: 'text', nullable: true })
  passengerName!: string | null;

  @Column({ type: 'text', nullable: true })
  passengerNationalIdEnc!: string | null;

  @Column({ type: 'text', nullable: true })
  passengerNationalIdHash!: string | null;

  @Column({ type: 'text', nullable: true })
  passengerMobileEnc!: string | null;

  @Column({ type: 'text', nullable: true })
  releasedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'releasedById',
    foreignKeyConstraintName: 'seat_locks_releasedById_fkey',
  })
  releasedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  releasedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'text', default: '' })
  reason!: string;

  @Column({
    type: 'enum',
    enum: LockClassification,
    enumName: 'LockClassification',
    default: LockClassification.PAYABLE,
  })
  classification!: LockClassification;

  @Column({ type: 'int', nullable: true })
  discountPct!: number | null;

  @Column({
    type: 'enum',
    enum: Role,
    enumName: 'Role',
    default: Role.IT_MANAGER,
  })
  requesterRank!: Role;

  @Column({
    type: 'enum',
    enum: LockApprovalStatus,
    enumName: 'LockApprovalStatus',
    default: LockApprovalStatus.APPROVED,
  })
  approvalStatus!: LockApprovalStatus;

  @Column({ type: 'text', nullable: true })
  approvedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'approvedById',
    foreignKeyConstraintName: 'seat_locks_approvedById_fkey',
  })
  approvedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  rejectedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'rejectedById',
    foreignKeyConstraintName: 'seat_locks_rejectedById_fkey',
  })
  rejectedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  rejectedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  expiresAt!: Date;

  @Column({ type: 'text', nullable: true })
  bookingId!: string | null;

  @ManyToOne(() => Booking, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'bookingId',
    foreignKeyConstraintName: 'seat_locks_bookingId_fkey',
  })
  booking!: Booking | null;
}
