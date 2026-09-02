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
import { User } from './user.entity';

@Index('saved_bank_accounts_userId_createdAt_idx', ['userId', 'createdAt'])
@Index('saved_bank_accounts_userId_shebaHash_idx', ['userId', 'shebaHash'])
@Entity('saved_bank_accounts')
export class SavedBankAccount {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'saved_bank_accounts_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'saved_bank_accounts_userId_fkey',
  })
  user!: User;

  @Column({ type: 'text' })
  bankName!: string;

  @Column({ type: 'text' })
  bankShort!: string;

  @Column({ type: 'text' })
  brandColor!: string;

  @Column({ type: 'text', nullable: true })
  cardPanEnc!: string | null;

  @Column({ type: 'text', nullable: true })
  cardLast4!: string | null;

  @Column({ type: 'text' })
  shebaEnc!: string;

  @Column({ type: 'text' })
  shebaHash!: string;

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
