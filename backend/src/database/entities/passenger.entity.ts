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
import { Booking } from './booking.entity';
import { bigintTransformer } from '../transformers/bigint.transformer';

export type PassengerType = 'ADULT' | 'CHILD' | 'INFANT';

@Index('passengers_nationalIdHash_idx', ['nationalIdHash'])
@Index('passengers_ticketNo_key', ['ticketNo'], { unique: true })
@Check(
  'passengers_passengerType_check',
  `"passengerType" IN ('ADULT','CHILD','INFANT')`,
)
@Check(
  'passengers_gender_check',
  `"gender" IS NULL OR "gender" IN ('male', 'female')`,
)
@Entity('passengers')
export class Passenger {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'passengers_pkey' })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  bookingId!: string;

  @ManyToOne(() => Booking, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'bookingId',
    foreignKeyConstraintName: 'passengers_bookingId_fkey',
  })
  booking!: Booking;

  @Column({ type: 'text' })
  fullName!: string;

  @Column({ type: 'text', nullable: true })
  nationalIdEnc!: string | null;

  @Column({ type: 'text', nullable: true })
  mobileEnc!: string | null;

  @Column({ type: 'text', nullable: true })
  nationalIdHash!: string | null;

  @Column({ type: 'text', nullable: true })
  passportNoEnc!: string | null;

  /** `male` | `female` — matches checkout Gender. */
  @Column({ type: 'text', nullable: true })
  gender!: 'male' | 'female' | null;

  @Column({ type: 'text', nullable: true })
  seatCode!: string | null;

  /** Adjacent EXST seat occupied by this same passenger. No baggage entitlement. */
  @Column({ type: 'text', nullable: true })
  extraSeatCode!: string | null;

  /** Passenger-level immutable e-ticket number, assigned on issuance. */
  @Column({ type: 'text', nullable: true })
  ticketNo!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  ticketIssuedAt!: Date | null;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  extraSeatFareIrr = 0n;

  @Column({ type: 'text', default: 'ADULT' })
  passengerType: PassengerType = 'ADULT';

  @Column({ type: 'date', default: '1970-01-01' })
  birthDate = '1970-01-01';

  @Column({ type: 'boolean', default: true })
  occupiesSeat = true;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  fareIrr = 0n;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  taxIrr = 0n;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  deletedAt!: Date | null;
}
