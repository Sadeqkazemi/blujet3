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
import { LedgerEntryType } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { AgencyProfile } from './agency-profile.entity';
import { Booking } from './booking.entity';
import { User } from './user.entity';

@Index('ledger_entries_agencyId_type_idx', ['agencyId', 'type'])
@Index('ledger_entries_occurredAt_type_idx', ['occurredAt', 'type'])
@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'ledger_entries_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text', nullable: true })
  bookingId!: string | null;

  @ManyToOne(() => Booking, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'bookingId',
    foreignKeyConstraintName: 'ledger_entries_bookingId_fkey',
  })
  booking!: Booking | null;

  @Column({ type: 'enum', enum: LedgerEntryType, enumName: 'LedgerEntryType' })
  type!: LedgerEntryType;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  signedAmountIrr!: bigint;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  occurredAt!: Date;

  @Column({ type: 'text', nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'ledger_entries_createdById_fkey',
  })
  createdBy!: User | null;

  @Column({ type: 'text', nullable: true })
  agencyId!: string | null;

  @ManyToOne(() => AgencyProfile, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'agencyId',
    foreignKeyConstraintName: 'ledger_entries_agencyId_fkey',
  })
  agency!: AgencyProfile | null;
}
