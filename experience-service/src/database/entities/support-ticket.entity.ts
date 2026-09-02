import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { JsonValue } from './job-application.entity';

export const SUPPORT_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'ANSWERED',
  'CLOSED',
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export const SUPPORT_DEPTS = ['SITE', 'AGENCY'] as const;
export type SupportDept = (typeof SUPPORT_DEPTS)[number];
export const SUPPORT_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

@Index('support_tickets_createdAt_idx', ['createdAt'])
@Index('support_tickets_status_idx', ['status'])
@Index('support_tickets_trackingCode_key', ['trackingCode'], { unique: true })
@Entity('support_tickets', { schema: 'experience' })
export class SupportTicket {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @BeforeInsert()
  generateId(): void {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  trackingCode!: string;

  @Column({ type: 'text' })
  subject!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'text' })
  requesterName!: string;

  @Column({ type: 'text' })
  requesterPhone!: string;

  @Column({ type: 'text', nullable: true })
  userId!: string | null;

  @Column({ type: 'enum', enum: SUPPORT_DEPTS, enumName: 'SupportTicketDept' })
  dept!: SupportDept;

  @Column({
    type: 'enum',
    enum: SUPPORT_PRIORITIES,
    enumName: 'SupportTicketPriority',
  })
  priority!: SupportPriority;

  @Column({
    type: 'enum',
    enum: SUPPORT_STATUSES,
    enumName: 'SupportTicketStatus',
  })
  status!: SupportStatus;

  @Column({ type: 'text', nullable: true })
  forwardedToId!: string | null;

  @Column({ type: 'text', nullable: true })
  forwardedToName!: string | null;

  @Column({ type: 'jsonb', default: [] })
  history!: JsonValue;

  @Column({ type: 'jsonb', default: [] })
  attachments!: string[];

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
