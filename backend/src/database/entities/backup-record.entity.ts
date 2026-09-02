import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { BackupStatus } from '../enums';
import { User } from './user.entity';

@Entity('backup_records')
export class BackupRecord {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'backup_records_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  fileName!: string;

  @Column({ type: 'int', nullable: true })
  sizeBytes!: number | null;

  @Column({
    type: 'enum',
    enum: BackupStatus,
    enumName: 'BackupStatus',
    default: BackupStatus.RUNNING,
  })
  status!: BackupStatus;

  @Column({ type: 'text', nullable: true })
  triggeredById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'triggeredById',
    foreignKeyConstraintName: 'backup_records_triggeredById_fkey',
  })
  triggeredBy!: User | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  startedAt!: Date;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;
}
