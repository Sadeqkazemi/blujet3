import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('cartable_projection_audits', { schema: 'ops' })
@Check('cartable_projection_audits_task_version_check', '"taskVersion" > 0')
@Index(
  'cartable_projection_audits_task_version_key',
  ['taskId', 'taskVersion'],
  { unique: true },
)
export class CartableProjectionAudit {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'cartable_projection_audits_pkey',
  })
  id!: string;

  @Column({ type: 'text' })
  taskId!: string;

  @Column({ type: 'int' })
  taskVersion!: number;

  @Column({ type: 'text' })
  mutation!: string;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
