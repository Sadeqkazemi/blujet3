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
import { ChairPermissionStatus } from '../enums';
import { User } from './user.entity';

@Index('chair_report_permissions_requesterId_status_idx', [
  'requesterId',
  'status',
])
@Entity('chair_report_permissions')
export class ChairReportPermission {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'chair_report_permissions_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  requesterId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'requesterId',
    foreignKeyConstraintName: 'chair_report_permissions_requesterId_fkey',
  })
  requester!: User;

  @Column({
    type: 'enum',
    enum: ChairPermissionStatus,
    enumName: 'ChairPermissionStatus',
    default: ChairPermissionStatus.PENDING,
  })
  status!: ChairPermissionStatus;

  @Column({ type: 'text', nullable: true })
  decidedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'decidedById',
    foreignKeyConstraintName: 'chair_report_permissions_decidedById_fkey',
  })
  decidedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  decidedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
