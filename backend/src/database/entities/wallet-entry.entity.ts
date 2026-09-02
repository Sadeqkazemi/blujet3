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
import { WalletEntryType } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { Booking } from './booking.entity';
import { User } from './user.entity';

@Index('wallet_entries_userId_idx', ['userId'])
@Entity('wallet_entries')
export class WalletEntry {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'wallet_entries_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'wallet_entries_userId_fkey',
  })
  user!: User;

  @Column({ type: 'enum', enum: WalletEntryType, enumName: 'WalletEntryType' })
  type!: WalletEntryType;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  signedAmountIrr!: bigint;

  @Column({ type: 'text', nullable: true })
  bookingId!: string | null;

  @ManyToOne(() => Booking, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'bookingId',
    foreignKeyConstraintName: 'wallet_entries_bookingId_fkey',
  })
  booking!: Booking | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
