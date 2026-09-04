import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import type { JsonValue } from '../json-types';
import { CoreItineraryFlightCoupon } from './core-itinerary-flight-coupon.entity';
import { CoreItineraryRefund } from './core-itinerary-refund.entity';
import { CoreItineraryTicketDocument } from './core-itinerary-ticket-document.entity';

@Entity('core_itinerary_coupon_events', { schema: 'orders' })
@Index(
  'core_itinerary_coupon_events_refund_coupon_key',
  ['refundId', 'couponId'],
  { unique: true },
)
@Index('core_itinerary_coupon_events_documentId_idx', ['documentId'])
@Check(
  'core_itinerary_coupon_events_transition_check',
  `"operation" = 'REFUND' AND "fromStatus" = 'OPEN' AND "toStatus" = 'REFUNDED'`,
)
export class CoreItineraryCouponEvent {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'core_itinerary_coupon_events_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  refundId!: string;

  @ManyToOne(() => CoreItineraryRefund, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'refundId',
    foreignKeyConstraintName: 'core_itinerary_coupon_events_refundId_fkey',
  })
  refund!: CoreItineraryRefund;

  @Column({ type: 'text' })
  documentId!: string;

  @ManyToOne(() => CoreItineraryTicketDocument, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'documentId',
    foreignKeyConstraintName: 'core_itinerary_coupon_events_documentId_fkey',
  })
  document!: CoreItineraryTicketDocument;

  @Column({ type: 'text' })
  couponId!: string;

  @ManyToOne(() => CoreItineraryFlightCoupon, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'couponId',
    foreignKeyConstraintName: 'core_itinerary_coupon_events_couponId_fkey',
  })
  coupon!: CoreItineraryFlightCoupon;

  @Column({ type: 'text', default: 'REFUND' })
  operation!: 'REFUND';

  @Column({ type: 'text' })
  fromStatus!: 'OPEN';

  @Column({ type: 'text' })
  toStatus!: 'REFUNDED';

  @Column({ type: 'jsonb' })
  ruleSnapshot!: JsonValue;

  @Column({ type: 'timestamp', precision: 3 })
  occurredAt!: Date;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
