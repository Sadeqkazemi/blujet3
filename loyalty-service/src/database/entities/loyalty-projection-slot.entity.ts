import {
  Check,
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { LoyaltyAggregateType } from '../../projection/loyalty-projection-event';

@Entity('loyalty_projection_slots', { schema: 'loyalty' })
@Check('loyalty_projection_slot_version_check', '"recordVersion" > 0')
@Check(
  'loyalty_projection_slot_aggregate_type_check',
  `"aggregateType" IN ('LoyaltyMember', 'LoyaltyPointsEntry', 'LoyaltyCardRequest', 'LoyaltyTierRule', 'LoyaltyPriceLock', 'LoyaltyReferral')`,
)
export class LoyaltyProjectionSlot {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'loyalty_projection_slots_pkey',
  })
  aggregateType!: LoyaltyAggregateType;

  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'loyalty_projection_slots_pkey',
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
