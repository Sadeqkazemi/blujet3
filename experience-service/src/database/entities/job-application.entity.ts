import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export const JOB_APPLICATION_STATUSES = [
  'SUBMITTED',
  'REFERRED',
  'HIRED',
  'REJECTED',
] as const;
export type JobApplicationStatus = (typeof JOB_APPLICATION_STATUSES)[number];
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

@Index('job_applications_nationalIdHash_idx', ['nationalIdHash'])
@Index('job_applications_status_idx', ['status'])
@Entity('job_applications', { schema: 'experience' })
export class JobApplication {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @BeforeInsert()
  generateId(): void {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text', nullable: true })
  jobPostingId!: string | null;

  @Column({ type: 'text' })
  jobTitleSnapshot!: string;

  @Column({ type: 'text' })
  firstName!: string;

  @Column({ type: 'text' })
  lastName!: string;

  @Column({ type: 'text' })
  nationalIdEnc!: string;

  @Column({ type: 'text' })
  nationalIdHash!: string;

  @Column({ type: 'text', nullable: true })
  fatherName!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  birthDate!: Date | null;

  @Column({ type: 'text', nullable: true })
  birthProvince!: string | null;

  @Column({ type: 'text', nullable: true })
  birthCity!: string | null;

  @Column({
    type: 'enum',
    enum: ['FEMALE', 'MALE'],
    enumName: 'JobApplicantGender',
    nullable: true,
  })
  gender!: 'FEMALE' | 'MALE' | null;

  @Column({
    type: 'enum',
    enum: ['SINGLE', 'MARRIED'],
    enumName: 'MaritalStatus',
    nullable: true,
  })
  marital!: 'SINGLE' | 'MARRIED' | null;

  @Column({
    type: 'enum',
    enum: ['CONSCRIPT', 'EXEMPT', 'WAIVED'],
    enumName: 'MilitaryStatus',
    nullable: true,
  })
  military!: 'CONSCRIPT' | 'EXEMPT' | 'WAIVED' | null;

  @Column({ type: 'text', nullable: true })
  exemptionType!: string | null;

  @Column({ type: 'text' })
  phone!: string;

  @Column({ type: 'text', nullable: true })
  email!: string | null;

  @Column({ type: 'text', nullable: true })
  residenceProvince!: string | null;

  @Column({ type: 'text', nullable: true })
  residenceAddress!: string | null;

  @Column({ type: 'jsonb', default: [] })
  eduEntries!: JsonValue;

  @Column({ type: 'jsonb', default: [] })
  workEntries!: JsonValue;

  @Column({ type: 'jsonb', default: [] })
  langEntries!: JsonValue;

  @Column({ type: 'text', nullable: true })
  skills!: string | null;

  @Column({ type: 'text', nullable: true })
  otherLangs!: string | null;

  @Column({ type: 'text', nullable: true })
  resumeFileName!: string | null;

  @Column({ type: 'text', nullable: true })
  resumeMimeType!: string | null;

  @Column({ type: 'int', nullable: true })
  resumeSizeBytes!: number | null;

  @Column({ type: 'text', nullable: true })
  resumePath!: string | null;

  @Column({
    type: 'enum',
    enum: JOB_APPLICATION_STATUSES,
    enumName: 'JobApplicationStatus',
    default: 'SUBMITTED',
  })
  status!: JobApplicationStatus;

  @Column({ type: 'text', nullable: true })
  assigneeId!: string | null;

  @Column({ type: 'text', nullable: true })
  assigneeName!: string | null;

  @Column({ type: 'jsonb', default: [] })
  history!: JsonValue;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
