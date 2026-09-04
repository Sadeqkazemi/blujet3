import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { CoreItinerarySegment } from './core-itinerary-segment.entity';
import { CoreItineraryTraveller } from './core-itinerary-traveller.entity';

@Index(
  'core_itinerary_traveller_segments_pair_key',
  ['travellerId', 'segmentId'],
  { unique: true },
)
@Index('core_itinerary_traveller_segments_segment_idx', ['segmentId'])
@Entity('core_itinerary_traveller_segments', { schema: 'orders' })
export class CoreItineraryTravellerSegment {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'core_itinerary_traveller_segments_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  travellerId!: string;

  @ManyToOne(() => CoreItineraryTraveller, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'travellerId',
    foreignKeyConstraintName:
      'core_itinerary_traveller_segments_travellerId_fkey',
  })
  traveller!: CoreItineraryTraveller;

  @Column({ type: 'text' })
  segmentId!: string;

  @ManyToOne(() => CoreItinerarySegment, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'segmentId',
    foreignKeyConstraintName:
      'core_itinerary_traveller_segments_segmentId_fkey',
  })
  segment!: CoreItinerarySegment;

  @Column({ type: 'boolean' })
  occupiesSeat!: boolean;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  fareIrr!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  taxIrr!: bigint;
}
