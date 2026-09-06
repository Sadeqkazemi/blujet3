import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { CoreItineraryEvent } from '../../common/events/core-itinerary-events';

@Entity('core_itinerary_event_receipts', { schema: 'reporting' })
@Index('reporting_itinerary_receipt_slot_version_idx', [
  'orderId',
  'eventType',
  'orderVersion',
])
@Check(
  'reporting_itinerary_receipt_event_type_check',
  `"eventType" IN ('OrderCreated', 'PaymentConfirmed', 'TicketIssued', 'RefundRequested')`,
)
@Check('reporting_itinerary_receipt_order_version_check', `"orderVersion" > 0`)
export class ReportingItineraryEventReceipt {
  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'reporting_itinerary_event_receipts_pkey',
  })
  eventId!: string;

  @Column({ type: 'char', length: 64 })
  fingerprint!: string;

  @Column({ type: 'text' })
  orderId!: string;

  @Column({ type: 'text' })
  eventType!: CoreItineraryEvent['eventType'];

  @Column({ type: 'int' })
  orderVersion!: number;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
    default: () => 'now()',
  })
  receivedAt!: Date;
}
