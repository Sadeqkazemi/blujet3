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
import { FlightDefinitionStatus, FlightInstanceStatus } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import type { JsonValue } from '../json-types';
import { Flight } from './flight.entity';
import { Schedule } from './schedule.entity';
import { User } from './user.entity';

@Index('flight_instances_departureAt_idx', ['departureAt'])
@Index('flight_instances_cancelledAt_idx', ['cancelledAt'], {
  where: '"status" = \'CANCELLED\'',
})
@Index(
  'flight_instances_scheduleId_departureAt_key',
  ['scheduleId', 'departureAt'],
  { unique: true },
)
@Entity('flight_instances')
export class FlightInstance {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'flight_instances_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  flightId!: string;

  @ManyToOne(() => Flight, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'flightId',
    foreignKeyConstraintName: 'flight_instances_flightId_fkey',
  })
  flight!: Flight;

  @Column({ type: 'timestamp', precision: 3 })
  departureAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  arrivalAt!: Date;

  @Column({ type: 'int' })
  capacity!: number;

  @Column({ type: 'int', default: 0 })
  charterSeats!: number;

  @Column({
    type: 'enum',
    enum: FlightInstanceStatus,
    enumName: 'FlightInstanceStatus',
    default: FlightInstanceStatus.SCHEDULED,
  })
  status!: FlightInstanceStatus;

  @Column({ type: 'int', nullable: true })
  agencySeatsAllocated!: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('flight_instances_definitionStatus_idx', ['definitionStatus'])
  basePriceIrr!: bigint | null;

  @Column({ type: 'jsonb', nullable: true })
  aiSuggestion!: JsonValue | null;

  @Column({ type: 'text', nullable: true })
  scheduleId!: string | null;

  @ManyToOne(() => Schedule, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'scheduleId',
    foreignKeyConstraintName: 'flight_instances_scheduleId_fkey',
  })
  schedule!: Schedule | null;

  /** Seasonal template that materialised this instance (nullable). */
  @Column({ type: 'text', nullable: true })
  @Index('flight_instances_scheduleTemplateId_idx', ['scheduleTemplateId'])
  scheduleTemplateId!: string | null;

  @Column({ type: 'text', nullable: true })
  aircraftRegistration!: string | null;

  @Column({ type: 'text', nullable: true })
  aircraftTypeOverride!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  saleEndsAt!: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  saleStartsAt!: Date | null;

  /** Explicit commercial gate for exposing this flight on the public site. */
  @Column({ type: 'boolean', default: true })
  publicSaleEnabled!: boolean;

  /** Independent commercial gate for exposing this flight to agencies. */
  @Column({ type: 'boolean', default: true })
  agencySaleEnabled!: boolean;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  niraSubmittedAt!: Date | null;

  /** Block time in minutes. When set, arrivalAt = departureAt + durationMinutes. */
  @Column({ type: 'int', nullable: true })
  durationMinutes!: number | null;

  /** Optional competitor observation (IRR) for commercial pricing UI. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  competitorPriceIrr!: bigint | null;

  /** Commercial manager panel: site visibility, per-class site prices, agency releases. */
  @Column({ type: 'jsonb', nullable: true })
  commercialPanelSettings!: JsonValue | null;

  /**
   * Per-cabin capacities: [{ cabin, seats }]. COMFORT is independent of ECONOMY.
   * Null on legacy rows (pre-definition migration).
   */
  @Column({ type: 'jsonb', nullable: true })
  cabinCapacities!: JsonValue | null;

  /**
   * Definition workflow. Legacy inventory defaults to PUBLISHED so existing
   * rows stay bookable without a re-approval.
   */
  @Column({
    type: 'enum',
    enum: FlightDefinitionStatus,
    enumName: 'FlightDefinitionStatus',
    default: FlightDefinitionStatus.PUBLISHED,
  })
  definitionStatus!: FlightDefinitionStatus;

  /** Optimistic lock — bump on every workflow / definition mutation. */
  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  publishedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  publishedByUserId!: string | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'publishedByUserId',
    foreignKeyConstraintName: 'flight_instances_publishedByUserId_fkey',
  })
  publishedBy!: User | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason!: string | null;

  @Column({ type: 'text', nullable: true })
  cancelledByUserId!: string | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'cancelledByUserId',
    foreignKeyConstraintName: 'flight_instances_cancelledByUserId_fkey',
  })
  cancelledBy!: User | null;

  /** Last CEO-approved definition snapshot (immutable until next approval). */
  @Column({ type: 'jsonb', nullable: true })
  approvedSnapshot!: JsonValue | null;

  /** Pending definition while definitionStatus = PENDING_REVISION. */
  @Column({ type: 'jsonb', nullable: true })
  pendingRevisionSnapshot!: JsonValue | null;

  /**
   * Real link to the normalized aircraft catalog, resolved automatically
   * from the effective aircraftType string (aircraftTypeOverride ??
   * flight.aircraftType) whenever it matches an AircraftDefinition.code.
   * Nullable: an aircraftType with no catalog entry yet (e.g. an ad-hoc
   * string not yet onboarded into AircraftDefinition) still works exactly
   * as before via the legacy AircraftSeatMap lookup — this column is an
   * enrichment, not a hard requirement. No relation mapping (see the same
   * TS2589-avoidance note on AircraftSeatMap.aircraftDefinitionId).
   */
  @Column({ type: 'text', nullable: true })
  aircraftDefinitionId!: string | null;
}
