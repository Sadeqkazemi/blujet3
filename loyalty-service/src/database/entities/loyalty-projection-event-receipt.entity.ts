import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { LoyaltyAggregateType } from '../../projection/loyalty-projection-event';

@Entity('loyalty_projection_event_receipts', { schema: 'loyalty' })
@Index('loyalty_projection_receipt_aggregate_version_idx', [
  'aggregateType',
  'aggregateId',
  'recordVersion',
])
@Check('loyalty_projection_receipt_version_check', '"recordVersion" > 0')
@Check(
  'loyalty_projection_receipt_aggregate_type_check',
  `"aggregateType" IN ('LoyaltyMember', 'LoyaltyPointsEntry', 'LoyaltyCardRequest', 'LoyaltyTierRule', 'LoyaltyPriceLock', 'LoyaltyReferral')`,
)
export class LoyaltyProjectionEventReceipt {
  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'loyalty_projection_event_receipts_pkey',
  })
  eventId!: string;

  @Column({ type: 'char', length: 64 })
  envelopeFingerprint!: string;

  @Column({ type: 'char', length: 64 })
  semanticFingerprint!: string;

  @Column({ type: 'text' })
  aggregateType!: LoyaltyAggregateType;

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
