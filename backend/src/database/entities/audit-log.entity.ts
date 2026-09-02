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
import { AuditCategory, Role } from '../enums';
import type { JsonValue } from '../json-types';
import { User } from './user.entity';

@Index('audit_logs_actorRole_category_createdAt_idx', [
  'actorRole',
  'category',
  'createdAt',
])
@Entity('audit_logs')
export class AuditLog {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'audit_logs_pkey' })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  actorId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'actorId',
    foreignKeyConstraintName: 'audit_logs_actorId_fkey',
  })
  actor!: User;

  @Column({ type: 'enum', enum: Role, enumName: 'Role' })
  actorRole!: Role;

  @Column({ type: 'enum', enum: AuditCategory, enumName: 'AuditCategory' })
  category!: AuditCategory;

  @Column({ type: 'text' })
  action!: string;

  @Column({ type: 'text' })
  detail!: string;

  @Column({ type: 'text', nullable: true })
  entityType!: string | null;

  @Column({ type: 'text', nullable: true })
  entityId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: JsonValue | null;

  @Column({ type: 'text', nullable: true })
  requestId!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
