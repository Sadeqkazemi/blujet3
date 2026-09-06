import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CoreItineraryEvent } from '../../common/events/core-itinerary-events';
import type { JsonValue } from '../json-types';

@Entity('core_itinerary_event_projections', { schema: 'reporting' })
@Index('reporting_itinerary_projection_event_id_key', ['eventId'], {
  unique: true,
})
@Index('reporting_itinerary_projection_occurred_at_idx', ['occurredAt'])
@Check(
  'reporting_itinerary_projection_event_type_check',
  `"eventType" IN ('OrderCreated', 'PaymentConfirmed', 'TicketIssued', 'RefundRequested')`,
)
@Check(
  'reporting_itinerary_projection_order_version_check',
  `"orderVersion" > 0`,
)
@Check('reporting_itinerary_projection_currency_check', `"currency" = 'IRR'`)
export class ReportingItineraryEventProjection {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'reporting_itinerary_event_projections_pkey',
  })
  orderId!: string;

  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'reporting_itinerary_event_projections_pkey',
  })
  eventType!: CoreItineraryEvent['eventType'];

  @Column({ type: 'uuid' })
  eventId!: string;

  @Column({ type: 'char', length: 64 })
  fingerprint!: string;

  @Column({ type: 'int' })
  orderVersion!: number;

  @Column({ type: 'text' })
  currency!: 'IRR';

  @Column({ type: 'jsonb' })
  payload!: JsonValue;

  @Column({ type: 'timestamptz', precision: 3 })
  occurredAt!: Date;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
    default: () => 'now()',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    precision: 3,
    default: () => 'now()',
  })
  updatedAt!: Date;
}
