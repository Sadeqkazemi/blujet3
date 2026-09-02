import { randomUUID } from 'node:crypto';
import { BeforeInsert, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { CabinClass, CommitmentStatus } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';

/** A charter operator's committed seat block for one cabin on one flight
 * instance. Reduces that cabin's online-sale availability (see
 * SearchService.seatsLeftForCabin / BookingService's per-cabin ceiling
 * check) for as long as status = ACTIVE. No relation mappings — plain FK
 * columns only, same TS2589-avoidance convention used for the aircraft
 * catalog entities elsewhere in this file set. */
@Index('charter_commitments_flightInstanceId_cabin_idx', [
  'flightInstanceId',
  'cabin',
])
@Index('charter_commitments_idempotencyKey_key', ['idempotencyKey'], {
  unique: true,
})
@Entity('charter_commitments')
export class CharterCommitment {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'charter_commitments_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  flightInstanceId!: string;

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
