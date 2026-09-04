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
import { bigintTransformer } from '../transformers/bigint.transformer';
import type { JsonValue } from '../json-types';
import { CoreItinerarySegment } from './core-itinerary-segment.entity';
import { CoreItineraryTicketDocument } from './core-itinerary-ticket-document.entity';

@Entity('core_itinerary_flight_coupons', { schema: 'orders' })
@Index(
  'core_itinerary_flight_coupons_document_number_key',
  ['ticketDocumentId', 'couponNumber'],
  { unique: true },
)
@Index(
  'core_itinerary_flight_coupons_document_segment_key',
  ['ticketDocumentId', 'segmentId'],
  { unique: true },
)
@Index('core_itinerary_flight_coupons_segmentId_idx', ['segmentId'])
@Check('core_itinerary_flight_coupons_number_check', `"couponNumber" > 0`)
@Check('core_itinerary_flight_coupons_status_check', `"status" IN ('OPEN')`)
export class CoreItineraryFlightCoupon {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'core_itinerary_flight_coupons_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  ticketDocumentId!: string;

  @ManyToOne(() => CoreItineraryTicketDocument, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'ticketDocumentId',
    foreignKeyConstraintName:
      'core_itinerary_flight_coupons_ticketDocumentId_fkey',
  })
  ticketDocument!: CoreItineraryTicketDocument;

  @Column({ type: 'text' })
  segmentId!: string;

  @ManyToOne(() => CoreItinerarySegment, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'segmentId',
    foreignKeyConstraintName: 'core_itinerary_flight_coupons_segmentId_fkey',
  })
  segment!: CoreItinerarySegment;

  @Column({ type: 'int' })
  couponNumber!: number;

  @Column({ type: 'text', default: 'OPEN' })
  status!: 'OPEN';

  @Column({ type: 'bigint', transformer: bigintTransformer })
  fareIrr!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  taxIrr!: bigint;

  @Column({ type: 'int', nullable: true })
  baggageAllowanceKg!: number | null;

  @Column({ type: 'jsonb' })
  segmentSnapshot!: JsonValue;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
