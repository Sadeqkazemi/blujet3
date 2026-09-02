import { randomUUID } from 'node:crypto';
import { BeforeInsert, Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Index('aircraft_seat_maps_aircraftType_key', ['aircraftType'], {
  unique: true,
})
@Entity('aircraft_seat_maps')
export class AircraftSeatMap {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'aircraft_seat_maps_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  aircraftType!: string;

  @Column({ type: 'int' })
  businessRowStart!: number;

  @Column({ type: 'int' })
  businessRowEnd!: number;

  @Column({ type: 'text', array: true, nullable: true })
  businessColsLeft!: string[] | null;

  @Column({ type: 'text', array: true, nullable: true })
  businessColsRight!: string[] | null;

  /** Optional comfort cabin band between business and economy. Null = no COMFORT seats. */
  @Column({ type: 'int', nullable: true })
  comfortRowStart!: number | null;

  @Column({ type: 'int', nullable: true })
  comfortRowEnd!: number | null;

  @Column({ type: 'text', array: true, nullable: true })
  comfortColsLeft!: string[] | null;

  @Column({ type: 'text', array: true, nullable: true })
  comfortColsRight!: string[] | null;

  @Column({ type: 'int' })
  economyRowStart!: number;

  @Column({ type: 'int' })
  economyRowEnd!: number;

  @Column({ type: 'text', array: true, nullable: true })
  economyColsLeft!: string[] | null;

  @Column({ type: 'text', array: true, nullable: true })
  economyColsRight!: string[] | null;

  /** Optional first-class cabin band, same nullable-band convention as
   * COMFORT above. Null = no FIRST seats (true for every existing
   * aircraft type — never fabricated). */
  @Column({ type: 'int', nullable: true })
  firstRowStart!: number | null;

  @Column({ type: 'int', nullable: true })
  firstRowEnd!: number | null;

  @Column({ type: 'text', array: true, nullable: true })
  firstColsLeft!: string[] | null;

  @Column({ type: 'text', array: true, nullable: true })
  firstColsRight!: string[] | null;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;

  @Column({ type: 'text', array: true, nullable: true, default: [] })
  excludedSeatCodes!: string[] | null;

  @Column({ type: 'int', array: true, default: [] })
  exitRows!: number[];

  /** Links to the normalized aircraft catalog (nullable: legacy rows
   * predate AircraftDefinition; backfilled by migration for existing
   * types). No relation mapping here — plain FK column only, to avoid the
   * TS2589 "excessively deep" TypeORM/jsonb-adjacent recursion issue seen
   * elsewhere in this codebase when relations pile up on heavily-queried
   * entities; the FK constraint is still enforced at the DB level. */
  @Column({ type: 'text', nullable: true })
  aircraftDefinitionId!: string | null;
}
