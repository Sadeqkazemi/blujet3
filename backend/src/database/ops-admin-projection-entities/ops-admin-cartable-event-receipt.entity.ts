import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('cartable_projection_event_receipts', { schema: 'ops' })
@Index('ops_admin_cartable_receipt_task_version_idx', ['taskId', 'taskVersion'])
@Check('ops_admin_cartable_receipt_version_check', '"taskVersion" > 0')
export class OpsAdminCartableEventReceipt {
  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'cartable_projection_event_receipts_pkey',
  })
  eventId!: string;

  @Column({ type: 'char', length: 64 })
  fingerprint!: string;

  @Column({ type: 'text' })
  taskId!: string;

  @Column({ type: 'int' })
  taskVersion!: number;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
    default: () => 'now()',
  })
  receivedAt!: Date;
}
