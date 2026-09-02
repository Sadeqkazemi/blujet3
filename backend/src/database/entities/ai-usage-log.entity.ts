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
import { bigintTransformer } from '../transformers/bigint.transformer';
import { User } from './user.entity';

@Index('ai_usage_logs_provider_createdAt_idx', ['provider', 'createdAt'])
@Entity('ai_usage_logs')
export class AiUsageLog {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'ai_usage_logs_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  provider!: string;

  @Column({ type: 'text' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'ai_usage_logs_userId_fkey',
  })
  user!: User;

  @Column({ type: 'text', nullable: true })
  contextId!: string | null;

  @Column({ type: 'int' })
  inputTokens!: number;

  @Column({ type: 'int' })
  outputTokens!: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  costIrr!: bigint | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
