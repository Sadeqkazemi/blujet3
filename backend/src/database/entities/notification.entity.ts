import { randomUUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { BeforeInsert } from 'typeorm';
import { NotificationCategory } from '../enums';

/** In-app notification. `recipientId` is a plain (relation-less) column —
 * same TS2589-avoidance convention as the aircraft-catalog/commitment
 * entities in this file set. `readAt = null` means unread.
 *
 * `dedupeKey` makes creation retry-safe: passing the same key twice (e.g.
 * a client retrying a timed-out request, or a service re-emitting an event
 * after a crash) returns the original row instead of creating a duplicate —
 * see NotificationsService.notify(). */
@Index('notifications_recipientId_readAt_idx', ['recipientId', 'readAt'])
@Index('notifications_recipientId_category_readAt_idx', [
  'recipientId',
  'category',
  'readAt',
])
@Index('notifications_dedupeKey_key', ['dedupeKey'], { unique: true })
@Entity('notifications')
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

  /** Stable English action code (CREATED/REFERRED/APPROVED/REJECTED/
   * DELETED/ACCESS_REVOKED/SENT/...) — not localized; `title`/`body` carry
   * the Persian display text. */
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
