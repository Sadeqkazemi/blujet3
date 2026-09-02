import { randomUUID } from 'node:crypto';
import { BeforeInsert, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { AircraftStatus } from '../enums';

/** Normalized aircraft catalog: code/model/title/status/totalCapacity, with
 * AircraftCabin (per-cabin capacity) and AircraftSeat (individual seats)
 * rows owned by aircraftDefinitionId. `code` is the same string value
 * historically used as `AircraftSeatMap.aircraftType`/`Flight.aircraftType`,
 * so existing aircraft-type lookups keep working unchanged (see
 * aircraft-type.util.ts) while this table becomes the authoritative source
 * for new aircraft going forward. */
@Index('aircraft_definitions_code_key', ['code'], { unique: true })
@Entity('aircraft_definitions')
export class AircraftDefinition {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'aircraft_definitions_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  code!: string;

  @Column({ type: 'text' })
  model!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({
    type: 'enum',
    enum: AircraftStatus,
    enumName: 'AircraftStatus',
    default: AircraftStatus.ACTIVE,
  })
  status!: AircraftStatus;

  @Column({ type: 'int' })
  totalCapacity!: number;

  /** Bumped on every update — optimistic-concurrency marker for the
   * definition as a whole (cabins/seats change together with it). */
  @Column({ type: 'int', default: 1 })
  version!: number;

  /** Null on migration-backfilled rows (no real historical actor exists —
   * never fabricated, see CLAUDE.md anti-fabrication rule). */
  @Column({ type: 'text', nullable: true })
  createdById!: string | null;

  @Column({ type: 'timestamp', precision: 3 })
  createdAt!: Date;

  @Column({ type: 'text', nullable: true })
  updatedById!: string | null;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
