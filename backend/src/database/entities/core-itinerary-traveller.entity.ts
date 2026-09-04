import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { CoreItineraryOrder } from './core-itinerary-order.entity';

@Index(
  'core_itinerary_travellers_order_sequence_key',
  ['orderId', 'sequence'],
  { unique: true },
)
@Index('core_itinerary_travellers_nationalIdHash_idx', ['nationalIdHash'])
@Check(
  'core_itinerary_travellers_passengerType_check',
  `"passengerType" IN ('ADULT','CHILD','INFANT')`,
)
@Check(
  'core_itinerary_travellers_gender_check',
  `"gender" IS NULL OR "gender" IN ('male','female')`,
)
@Entity('core_itinerary_travellers', { schema: 'orders' })
export class CoreItineraryTraveller {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'core_itinerary_travellers_pkey',
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
    foreignKeyConstraintName: 'core_itinerary_travellers_orderId_fkey',
  })
  order!: CoreItineraryOrder;

  @Column({ type: 'int' })
  sequence!: number;

  @Column({ type: 'text' })
  fullName!: string;

  @Column({ type: 'text' })
  passengerType!: 'ADULT' | 'CHILD' | 'INFANT';

  @Column({ type: 'date' })
  birthDate!: string;

  @Column({ type: 'text', nullable: true })
  nationalIdEnc!: string | null;

  @Column({ type: 'text', nullable: true })
  nationalIdHash!: string | null;

  @Column({ type: 'text', nullable: true })
  passportNoEnc!: string | null;

  @Column({ type: 'text', nullable: true })
  mobileEnc!: string | null;

  @Column({ type: 'text', nullable: true })
  gender!: 'male' | 'female' | null;
}
