import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { AgencyAggregateType } from '../../projection/agency-projection-event';

@Entity('agency_projection_event_receipts', { schema: 'agency' })
@Index('agency_projection_receipt_aggregate_version_idx', [
  'aggregateType',
  'aggregateId',
  'recordVersion',
])
@Check('agency_projection_receipt_version_check', '"recordVersion" > 0')
@Check(
  'agency_projection_receipt_aggregate_type_check',
  `"aggregateType" IN ('AgencyProfile', 'AgencyInvoice', 'AgencyCreditRequest')`,
)
export class AgencyProjectionEventReceipt {
  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'agency_projection_event_receipts_pkey',
  })
  eventId!: string;

  @Column({ type: 'char', length: 64 })
  envelopeFingerprint!: string;

  @Column({ type: 'char', length: 64 })
  semanticFingerprint!: string;

  @Column({ type: 'text' })
  aggregateType!: AgencyAggregateType;

  @Column({ type: 'text' })
  aggregateId!: string;

  @Column({ type: 'int' })
  recordVersion!: number;

  @Column({ type: 'text' })
  auditId!: string;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
    default: () => 'now()',
  })
  receivedAt!: Date;
}
