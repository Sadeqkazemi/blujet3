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
import { AircraftSeatSide, CabinClass } from '../enums';
import { AircraftDefinition } from './aircraft-definition.entity';

/** Individual seat row for a normalized aircraft. `label` (e.g. "12A") must
 * be unique within one aircraftDefinitionId — the seat-number-uniqueness
 * rule. Rows are generated from the same row/column band description used
 * to create/update the aircraft (see AircraftService), so they always
 * reconcile with the aircraft's AircraftCabin capacities and the legacy
 * AircraftSeatMap row kept in sync alongside them. */
@Index(
  'aircraft_seats_aircraftDefinitionId_label_key',
  ['aircraftDefinitionId', 'label'],
  { unique: true },
)
@Index('aircraft_seats_aircraftDefinitionId_idx', ['aircraftDefinitionId'])
@Entity('aircraft_seats')
export class AircraftSeat {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'aircraft_seats_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  aircraftDefinitionId!: string;

  @ManyToOne(() => AircraftDefinition, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'aircraftDefinitionId',
    foreignKeyConstraintName: 'aircraft_seats_aircraftDefinitionId_fkey',
  })
  aircraftDefinition!: AircraftDefinition;

  @Column({ type: 'int' })
  row!: number;

  @Column({ type: 'text' })
  column!: string;

  @Column({ type: 'text' })
  label!: string;

  @Column({ type: 'enum', enum: CabinClass, enumName: 'CabinClass' })
  cabinType!: CabinClass;

  /** Which side of the aisle this seat sits on — the "aisle position". */
  @Column({
    type: 'enum',
    enum: AircraftSeatSide,
    enumName: 'AircraftSeatSide',
  })
  side!: AircraftSeatSide;

  /** Disabled/blocked seat (excluded from sale — e.g. exit-row/galley
   * cutouts, same concept as AircraftSeatMap.excludedSeatCodes). */
  @Column({ type: 'boolean', default: false })
  isBlocked!: boolean;

  @Column({ type: 'timestamp', precision: 3 })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
