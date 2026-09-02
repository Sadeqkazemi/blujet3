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
import { JobType } from '../enums';
import { StoredFile } from './stored-file.entity';

@Index('job_postings_imageFileId_key', ['imageFileId'], { unique: true })
@Entity('job_postings')
export class JobPosting {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'job_postings_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  dept!: string;

  @Column({ type: 'text' })
  city!: string;

  @Column({
    type: 'enum',
    enum: JobType,
    enumName: 'JobType',
    default: JobType.FULL_TIME,
  })
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

  @ManyToOne(() => StoredFile, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'imageFileId',
    foreignKeyConstraintName: 'job_postings_imageFileId_fkey',
  })
  imageFile!: StoredFile | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
