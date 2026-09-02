import { randomUUID } from 'node:crypto';
import { BeforeInsert, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { CabinClass, CommitmentStatus } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';

/** An agency's committed seat block for one cabin on one flight instance —
 * the capacity/financial declaration layer. Reduces that cabin's
 * online-sale availability for as long as status = ACTIVE, same mechanism
 * as CharterCommitment. Distinct from AgencyAllotment (which drives the
 * existing per-ticket agency-channel booking flow in
 * booking-engine/booking.service.ts#createAgencyAllotmentBooking) — this
 * table is the commitment record commitments/capacity math read from;
 * actual ticket sales continue through the existing, tested allotment
 * flow, which this commitment's capacity ceiling also protects. No
 * relation mappings — plain FK columns only (TS2589-avoidance
 * convention). */
@Index('agency_seat_commitments_flightInstanceId_cabin_idx', [
  'flightInstanceId',
  'cabin',
])
@Index('agency_seat_commitments_agencyId_idx', ['agencyId'])
@Index('agency_seat_commitments_idempotencyKey_key', ['idempotencyKey'], {
  unique: true,
})
@Entity('agency_seat_commitments')
export class AgencySeatCommitment {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_seat_commitments_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  flightInstanceId!: string;

  @Column({ type: 'text' })
  agencyId!: string;

  @Column({ type: 'enum', enum: CabinClass, enumName: 'CabinClass' })
  cabin!: CabinClass;

  @Column({ type: 'int' })
  seats!: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  contractPriceIrr!: bigint;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  startDate!: Date | null;

  /** aka "endDate" in the API contract — named to match the pre-existing
   * AgencyAllotment.releaseAt convention. */
  @Column({ type: 'timestamp', precision: 3, nullable: true })
  releaseAt!: Date | null;

  @Column({
    type: 'enum',
    enum: CommitmentStatus,
    enumName: 'CommitmentStatus',
    default: CommitmentStatus.ACTIVE,
  })
  status!: CommitmentStatus;

  @Column({ type: 'text', nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'text' })
  createdById!: string;

  @Column({ type: 'timestamp', precision: 3 })
  createdAt!: Date;

  @Column({ type: 'text', nullable: true })
  cancelledById!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  cancelledAt!: Date | null;
}
