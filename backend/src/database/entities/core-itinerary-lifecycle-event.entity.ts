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
import { CoreItineraryOrder } from './core-itinerary-order.entity';

@Index(
  'core_itinerary_lifecycle_events_order_event_key',
  ['orderId', 'eventType'],
  { unique: true },
)
@Index('core_itinerary_lifecycle_events_occurredAt_idx', ['occurredAt'])
@Check(
  'core_itinerary_lifecycle_events_transition_check',
  `("eventType" = 'HOLD_EXPIRED' AND "fromStatus" = 'HELD' AND "toStatus" = 'EXPIRED') OR ("eventType" = 'HOLD_CANCELLED' AND "fromStatus" = 'HELD' AND "toStatus" = 'CANCELLED')`,
)
@Entity('core_itinerary_lifecycle_events', { schema: 'orders' })
export class CoreItineraryLifecycleEvent {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'core_itinerary_lifecycle_events_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  orderId!: string;

  @ManyToOne(() => CoreItineraryOrder, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'orderId',
    foreignKeyConstraintName: 'core_itinerary_lifecycle_events_orderId_fkey',
  })
  order!: CoreItineraryOrder;

  @Column({ type: 'text' })
  eventType!: 'HOLD_EXPIRED' | 'HOLD_CANCELLED';

  @Column({ type: 'text' })
  fromStatus!: 'HELD';

  @Column({ type: 'text' })
  toStatus!: 'EXPIRED' | 'CANCELLED';

  @Column({ type: 'timestamp', precision: 3 })
  occurredAt!: Date;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
