import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { SmsMessageType, SmsStatus } from '../enums';

@Index('sms_logs_createdAt_idx', ['createdAt'])
@Entity('sms_logs')
export class SmsLog {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'sms_logs_pkey' })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @Column({ type: 'enum', enum: SmsMessageType, enumName: 'SmsMessageType' })
  messageType!: SmsMessageType;

  @Column({ type: 'enum', enum: SmsStatus, enumName: 'SmsStatus' })
  status!: SmsStatus;

  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
