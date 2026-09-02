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
  JobApplicantGender,
  JobApplicationStatus,
  MaritalStatus,
  MilitaryStatus,
} from '../enums';
import type { JsonValue } from '../json-types';
import { JobPosting } from './job-posting.entity';
import { User } from './user.entity';

@Index('job_applications_nationalIdHash_idx', ['nationalIdHash'])
@Index('job_applications_status_idx', ['status'])
@Entity('job_applications')
export class JobApplication {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'job_applications_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text', nullable: true })
  jobPostingId!: string | null;

  @ManyToOne(() => JobPosting, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'jobPostingId',
    foreignKeyConstraintName: 'job_applications_jobPostingId_fkey',
  })
  jobPosting!: JobPosting | null;

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
    enum: JobApplicantGender,
    enumName: 'JobApplicantGender',
    nullable: true,
  })
  gender!: JobApplicantGender | null;

  @Column({
    type: 'enum',
    enum: MaritalStatus,
    enumName: 'MaritalStatus',
    nullable: true,
  })
  marital!: MaritalStatus | null;

  @Column({
    type: 'enum',
    enum: MilitaryStatus,
    enumName: 'MilitaryStatus',
    nullable: true,
  })
  military!: MilitaryStatus | null;

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
    enum: JobApplicationStatus,
    enumName: 'JobApplicationStatus',
    default: JobApplicationStatus.SUBMITTED,
  })
  status!: JobApplicationStatus;

  @Column({ type: 'text', nullable: true })
  assigneeId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'assigneeId',
    foreignKeyConstraintName: 'job_applications_assigneeId_fkey',
  })
  assignee!: User | null;

  @Column({ type: 'jsonb', default: [] })
  history!: JsonValue;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
