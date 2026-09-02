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
import { CartableCategory, CartableSourceType, CartableStatus } from '../enums';
import { User } from './user.entity';

@Index('cartable_tasks_assigneeId_status_idx', ['assigneeId', 'status'])
@Index('cartable_tasks_sourceType_sourceId_idx', ['sourceType', 'sourceId'])
@Index('cartable_tasks_assigneeId_readAt_idx', ['assigneeId', 'readAt'])
@Index('cartable_tasks_conversationId_createdAt_idx', [
  'conversationId',
  'createdAt',
])
@Entity('cartable_tasks')
export class CartableTask {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'cartable_tasks_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  assigneeId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'assigneeId',
    foreignKeyConstraintName: 'cartable_tasks_assigneeId_fkey',
  })
  assignee!: User;

  @Column({
    type: 'enum',
    enum: CartableCategory,
    enumName: 'CartableCategory',
  })
  category!: CartableCategory;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments!: string[] | null;

  @Column({ type: 'text', nullable: true })
  senderId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'senderId',
    foreignKeyConstraintName: 'cartable_tasks_senderId_fkey',
  })
  sender!: User | null;

  @Column({ type: 'text', nullable: true })
  senderLabelFa!: string | null;

  @Column({
    type: 'enum',
    enum: CartableSourceType,
    enumName: 'CartableSourceType',
    nullable: true,
  })
  sourceType!: CartableSourceType | null;

  @Column({ type: 'text', nullable: true })
  sourceId!: string | null;

  @Column({ type: 'text', nullable: true })
  conversationId!: string | null;

  @Column({
    type: 'enum',
    enum: CartableStatus,
    enumName: 'CartableStatus',
    default: CartableStatus.OPEN,
  })
  status!: CartableStatus;

  @Column({ type: 'text', nullable: true })
  resolutionNote!: string | null;

  @Column({ type: 'text', nullable: true })
  transferredToId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'transferredToId',
    foreignKeyConstraintName: 'cartable_tasks_transferredToId_fkey',
  })
  transferredTo!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
