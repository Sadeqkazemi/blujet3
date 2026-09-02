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
import {
  SupportTicketDept,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../enums';
import type { JsonValue } from '../json-types';
import { User } from './user.entity';

@Index('support_tickets_createdAt_idx', ['createdAt'])
@Index('support_tickets_status_idx', ['status'])
@Index('support_tickets_trackingCode_key', ['trackingCode'], { unique: true })
@Entity('support_tickets')
export class SupportTicket {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'support_tickets_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
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

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'support_tickets_userId_fkey',
  })
  user!: User | null;

  @Column({
    type: 'enum',
    enum: SupportTicketDept,
    enumName: 'SupportTicketDept',
    default: SupportTicketDept.SITE,
  })
  dept!: SupportTicketDept;

  @Column({
    type: 'enum',
    enum: SupportTicketPriority,
    enumName: 'SupportTicketPriority',
    default: SupportTicketPriority.MEDIUM,
  })
  priority!: SupportTicketPriority;

  @Column({
    type: 'enum',
    enum: SupportTicketStatus,
    enumName: 'SupportTicketStatus',
    default: SupportTicketStatus.OPEN,
  })
  status!: SupportTicketStatus;

  @Column({ type: 'text', nullable: true })
  forwardedToId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'forwardedToId',
    foreignKeyConstraintName: 'support_tickets_forwardedToId_fkey',
  })
  forwardedTo!: User | null;

  @Column({ type: 'jsonb', default: [] })
  history!: JsonValue;

  @Column({ type: 'jsonb', default: [] })
  attachments!: string[];

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
