import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export const NotificationCategory = {
  CARTABLE: 'CARTABLE',
  MESSAGE: 'MESSAGE',
  REQUEST: 'REQUEST',
  APPROVAL: 'APPROVAL',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationCategory =
  (typeof NotificationCategory)[keyof typeof NotificationCategory];

@Index('notifications_recipientId_readAt_idx', ['recipientId', 'readAt'])
@Index('notifications_recipientId_category_readAt_idx', [
  'recipientId',
  'category',
  'readAt',
])
@Index('notifications_dedupeKey_key', ['dedupeKey'], { unique: true })
@Entity('notifications', { schema: 'notify' })
export class Notification {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'notifications_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  recipientId!: string;

  @Column({
    type: 'enum',
    enum: NotificationCategory,
    enumName: 'NotificationCategory',
  })
  category!: NotificationCategory;

  @Column({ type: 'text' })
  action!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ type: 'text', nullable: true })
  entityType!: string | null;

  @Column({ type: 'text', nullable: true })
  entityId!: string | null;

  @Column({ type: 'text', nullable: true })
  dedupeKey!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
