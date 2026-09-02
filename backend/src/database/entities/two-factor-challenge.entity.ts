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
import { StepUpScope, TwoFactorPurpose } from '../enums';
import { User } from './user.entity';

@Index('two_factor_challenges_userId_idx', ['userId'])
@Entity('two_factor_challenges')
export class TwoFactorChallenge {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'two_factor_challenges_pkey',
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
    foreignKeyConstraintName: 'two_factor_challenges_userId_fkey',
  })
  user!: User;

  @Column({
    type: 'enum',
    enum: TwoFactorPurpose,
    enumName: 'TwoFactorPurpose',
  })
  purpose!: TwoFactorPurpose;

  @Column({ type: 'text' })
  codeHash!: string;

  @Column({ type: 'timestamp', precision: 3 })
  expiresAt!: Date;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  consumedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({
    type: 'enum',
    enum: StepUpScope,
    enumName: 'StepUpScope',
    nullable: true,
  })
  scope!: StepUpScope | null;
}
