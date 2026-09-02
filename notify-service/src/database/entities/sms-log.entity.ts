import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export const SmsMessageType = {
  OTP: 'OTP',
  TEMP_PASSWORD: 'TEMP_PASSWORD',
  SURVEY_INVITE: 'SURVEY_INVITE',
  FLIGHT_CANCELLED: 'FLIGHT_CANCELLED',
} as const;
export type SmsMessageType =
  (typeof SmsMessageType)[keyof typeof SmsMessageType];

export const SmsStatus = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;
export type SmsStatus = (typeof SmsStatus)[keyof typeof SmsStatus];

@Index('sms_logs_createdAt_idx', ['createdAt'])
@Index('sms_logs_sourceEventId_key', ['sourceEventId'], { unique: true })
@Entity('sms_logs', { schema: 'notify' })
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

  @Column({ type: 'text', nullable: true })
  sourceEventId!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
