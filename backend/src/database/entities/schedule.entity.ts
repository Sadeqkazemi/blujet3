import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Flight } from './flight.entity';

@Entity('schedules')
export class Schedule {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'schedules_pkey' })
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
    foreignKeyConstraintName: 'schedules_flightId_fkey',
  })
  flight!: Flight;

  @Column({ type: 'text' })
  rrule!: string;

  @Column({ type: 'int' })
  depHour!: number;

  @Column({ type: 'int' })
  depMinute!: number;

  @Column({ type: 'int' })
  durationMin!: number;

  @Column({ type: 'int' })
  capacity!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
