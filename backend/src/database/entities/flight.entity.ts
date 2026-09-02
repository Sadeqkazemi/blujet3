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
import { Route } from './route.entity';

@Index('flights_flightNo_key', ['flightNo'], { unique: true })
@Entity('flights')
export class Flight {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'flights_pkey' })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  flightNo!: string;

  @Column({ type: 'text' })
  routeId!: string;

  @ManyToOne(() => Route, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'routeId',
    foreignKeyConstraintName: 'flights_routeId_fkey',
  })
  route!: Route;

  @Column({ type: 'text' })
  aircraftType!: string;
}
