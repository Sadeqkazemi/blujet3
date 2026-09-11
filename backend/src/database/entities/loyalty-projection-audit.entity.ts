import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('loyalty_projection_audits', { schema: 'loyalty' })
@Check('loyalty_projection_audits_version_check', '"recordVersion" > 0')
@Index(
  'loyalty_projection_audits_aggregate_version_key',
  ['aggregateType', 'aggregateId', 'recordVersion'],
  { unique: true },
)
export class LoyaltyProjectionAudit {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'loyalty_projection_audits_pkey',
  })
  id!: string;

  @Column({ type: 'text' })
  aggregateType!: string;

  @Column({ type: 'text' })
  aggregateId!: string;

  @Column({ type: 'int' })
  recordVersion!: number;

  @Column({ type: 'text' })
  mutation!: string;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
