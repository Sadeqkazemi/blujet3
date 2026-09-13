import {
  Check,
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { AgencyAggregateType } from '../../projection/agency-projection-event';

@Entity('agency_projection_slots', { schema: 'agency' })
@Check('agency_projection_slot_version_check', '"recordVersion" > 0')
@Check(
  'agency_projection_slot_aggregate_type_check',
  `"aggregateType" IN ('AgencyProfile', 'AgencyInvoice', 'AgencyCreditRequest')`,
)
export class AgencyProjectionSlot {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_projection_slots_pkey',
  })
  aggregateType!: AgencyAggregateType;

  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_projection_slots_pkey',
  })
  aggregateId!: string;

  @Column({ type: 'int' })
  recordVersion!: number;

  @Column({ type: 'char', length: 64 })
  semanticFingerprint!: string;

  @Column({ type: 'text' })
  auditId!: string;

  @UpdateDateColumn({
    type: 'timestamptz',
    precision: 3,
    default: () => 'now()',
  })
  updatedAt!: Date;
}
