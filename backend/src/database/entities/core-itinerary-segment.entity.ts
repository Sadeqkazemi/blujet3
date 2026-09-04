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
import { CabinClass } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { CoreItineraryOrder } from './core-itinerary-order.entity';
import { FlightInstance } from './flight-instance.entity';

export type CoreItineraryExtraSnapshot = {
  id: string;
  code: string;
  titleFa: string;
  billingUnit: string;
  unitPriceIrr: string;
  quantity: number;
  totalIrr: string;
};

@Index('core_itinerary_segments_order_sequence_key', ['orderId', 'sequence'], {
  unique: true,
})
@Index(
  'core_itinerary_segments_order_flight_key',
  ['orderId', 'flightInstanceId'],
  { unique: true },
)
@Index('core_itinerary_segments_flight_cabin_idx', [
  'flightInstanceId',
  'cabin',
])
@Entity('core_itinerary_segments', { schema: 'orders' })
export class CoreItinerarySegment {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'core_itinerary_segments_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  orderId!: string;

  @ManyToOne(() => CoreItineraryOrder, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'orderId',
    foreignKeyConstraintName: 'core_itinerary_segments_orderId_fkey',
  })
  order!: CoreItineraryOrder;

  @Column({ type: 'int' })
  sequence!: number;

  @Column({ type: 'text' })
  flightInstanceId!: string;

  @ManyToOne(() => FlightInstance, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'flightInstanceId',
    foreignKeyConstraintName: 'core_itinerary_segments_flightInstanceId_fkey',
  })
  flightInstance!: FlightInstance;

  @Column({ type: 'text' })
  flightNo!: string;

  @Column({ type: 'text' })
  originCode!: string;

  @Column({ type: 'text' })
  destinationCode!: string;

  @Column({ type: 'timestamp', precision: 3 })
  departureAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  arrivalAt!: Date;

  @Column({ type: 'enum', enum: CabinClass, enumName: 'CabinClass' })
  cabin!: CabinClass;

  @Column({ type: 'text', nullable: true })
  fareClassCode!: string | null;

  @Column({ type: 'int' })
  occupiedSeats!: number;

  @Column({ type: 'int', nullable: true })
  baggageAllowanceKg!: number | null;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  fareIrr!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  taxIrr!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  extrasIrr!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  totalIrr!: bigint;

  @Column({ type: 'jsonb', default: [] })
  extrasSnapshot!: CoreItineraryExtraSnapshot[];
}
