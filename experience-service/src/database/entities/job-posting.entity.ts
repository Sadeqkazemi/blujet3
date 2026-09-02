import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export const JOB_TYPES = ['FULL_TIME', 'REMOTE', 'PART_TIME'] as const;
export type JobType = (typeof JOB_TYPES)[number];

@Index('job_postings_imageFileId_key', ['imageFileId'], { unique: true })
@Entity('job_postings')
export class JobPosting {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @BeforeInsert()
  generateId(): void {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  dept!: string;

  @Column({ type: 'text' })
  city!: string;

  @Column({ type: 'enum', enum: JOB_TYPES, enumName: 'JobType' })
  type!: JobType;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'text', array: true, nullable: true })
  generalReqs!: string[] | null;

  @Column({ type: 'text', array: true, nullable: true })
  specialReqs!: string[] | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'text', nullable: true })
  imageFileId!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
