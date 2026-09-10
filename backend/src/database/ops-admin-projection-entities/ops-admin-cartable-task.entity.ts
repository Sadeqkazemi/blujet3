import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { CartableCategory, CartableSourceType, CartableStatus } from '../enums';

@Index('ops_admin_cartable_status_created_idx', ['status', 'createdAt', 'id'])
@Index('ops_admin_cartable_status_category_created_idx', [
  'status',
  'category',
  'createdAt',
  'id',
])
@Check(
  'ops_admin_cartable_task_version_check',
  '"taskVersion" IS NULL OR "taskVersion" > 0',
)
@Entity('cartable_tasks', { schema: 'ops' })
export class OpsAdminCartableTaskProjection {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'cartable_tasks_pkey',
  })
  id!: string;

  @Column({ type: 'text' })
  assigneeId!: string;

  @Column({
    type: 'enum',
    enum: CartableCategory,
    enumName: 'CartableCategory',
  })
  category!: CartableCategory;

  @Column({
    type: 'enum',
    enum: CartableSourceType,
    enumName: 'CartableSourceType',
    nullable: true,
  })
  sourceType!: CartableSourceType | null;

  @Column({ type: 'text', nullable: true })
  sourceId!: string | null;

  @Column({
    type: 'enum',
    enum: CartableStatus,
    enumName: 'CartableStatus',
    default: CartableStatus.OPEN,
  })
  status!: CartableStatus;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  readAt!: Date | null;

  @Column({ type: 'int', nullable: true })
  taskVersion!: number | null;

  @Column({ type: 'text', nullable: true })
  auditId!: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  fingerprint!: string | null;

  @CreateDateColumn({
    type: 'timestamp',
    precision: 3,
    default: () => 'now()',
  })
  createdAt!: Date;
}
