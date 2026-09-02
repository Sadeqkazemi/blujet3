import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { FlightScheduleTemplateStatus } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import type { JsonValue } from '../json-types';
import { Airport } from './airport.entity';
import { AircraftDefinition } from './aircraft-definition.entity';
import { User } from './user.entity';

@Unique('flight_schedule_templates_idempotencyKey_key', ['idempotencyKey'])
@Index('flight_schedule_templates_status_idx', ['status'])
@Check(
  'flight_schedule_templates_distanceKm_check',
  '"distanceKm" IS NULL OR "distanceKm" > 0',
)
@Check(
  'flight_schedule_templates_distanceSource_check',
  `"distanceSource" IS NULL OR "distanceSource" IN ('AI', 'MANUAL')`,
)
@Entity('flight_schedule_templates')
export class FlightScheduleTemplate {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'flight_schedule_templates_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  originAirportId!: string;

  @ManyToOne(() => Airport, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'originAirportId',
    foreignKeyConstraintName: 'flight_schedule_templates_originAirportId_fkey',
  })
  originAirport!: Airport;

  @Column({ type: 'text' })
  destinationAirportId!: string;

  @ManyToOne(() => Airport, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'destinationAirportId',
    foreignKeyConstraintName:
      'flight_schedule_templates_destinationAirportId_fkey',
  })
  destinationAirport!: Airport;

  @Column({ type: 'text' })
  flightNoBase!: string;

  @Column({ type: 'text' })
  aircraftDefinitionId!: string;

  @ManyToOne(() => AircraftDefinition, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'aircraftDefinitionId',
    foreignKeyConstraintName:
      'flight_schedule_templates_aircraftDefinitionId_fkey',
  })
  aircraftDefinition!: AircraftDefinition;

  /** Local departure clock HH:mm in the origin airport timezone. */
  @Column({ type: 'text' })
  departureTime!: string;

  @Column({ type: 'int' })
  durationMinutes!: number;

  @Column({ type: 'int', nullable: true })
  distanceKm!: number | null;

  @Column({ type: 'text', nullable: true })
  distanceSource!: 'AI' | 'MANUAL' | null;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  /** ISO weekday numbers 1=Mon … 7=Sun (JSON array of ints). */
  @Column({ type: 'jsonb' })
  weekdays!: JsonValue;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  agencyPriceIrr!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  legalCeilingIrr!: bigint;

  /** Route snapshot: [{cabin,seats,basePriceIrr,defaultClassCode}]. */
  @Column({ type: 'jsonb' })
  cabinCapacities!: JsonValue;

  @Column({
    type: 'enum',
    enum: FlightScheduleTemplateStatus,
    enumName: 'FlightScheduleTemplateStatus',
    default: FlightScheduleTemplateStatus.ACTIVE,
  })
  status!: FlightScheduleTemplateStatus;

  @Column({ type: 'text' })
  idempotencyKey!: string;

  @Column({ type: 'text' })
  createdByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'createdByUserId',
    foreignKeyConstraintName: 'flight_schedule_templates_createdByUserId_fkey',
  })
  createdBy!: User;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  deactivatedAt!: Date | null;
}
