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
import { Booking } from './booking.entity';

export type BookingLifecycleEventType = 'HOLD_EXPIRED';

@Entity('booking_lifecycle_events', { schema: 'orders' })
@Index(
  'booking_lifecycle_events_bookingId_eventType_key',
  ['bookingId', 'eventType'],
  { unique: true },
)
@Index('booking_lifecycle_events_occurredAt_idx', ['occurredAt'])
@Check(
  'booking_lifecycle_events_transition_check',
  `"eventType" = 'HOLD_EXPIRED' AND "fromStatus" = 'HELD' AND "toStatus" = 'EXPIRED'`,
)
export class BookingLifecycleEvent {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'booking_lifecycle_events_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  bookingId!: string;

  @ManyToOne(() => Booking, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'bookingId',
    foreignKeyConstraintName: 'booking_lifecycle_events_bookingId_fkey',
  })
  booking!: Booking;

  @Column({ type: 'text' })
  eventType!: BookingLifecycleEventType;

  @Column({ type: 'text' })
  fromStatus!: 'HELD';

  @Column({ type: 'text' })
  toStatus!: 'EXPIRED';

  @Column({ type: 'timestamp', precision: 3 })
  occurredAt!: Date;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
