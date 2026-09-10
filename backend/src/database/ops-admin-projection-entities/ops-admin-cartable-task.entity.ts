import {
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

  @CreateDateColumn({
    type: 'timestamp',
    precision: 3,
    default: () => 'now()',
  })
  createdAt!: Date;
}
