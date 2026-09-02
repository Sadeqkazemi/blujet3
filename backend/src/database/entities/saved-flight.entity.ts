import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { CabinClass } from '../enums';
import { FlightInstance } from './flight-instance.entity';
import { User } from './user.entity';

@Index('saved_flights_userId_createdAt_idx', ['userId', 'createdAt'])
@Index(
  'saved_flights_userId_flightInstanceId_cabin_key',
  ['userId', 'flightInstanceId', 'cabin'],
  { unique: true },
)
@Entity('saved_flights')
export class SavedFlight {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'saved_flights_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'saved_flights_userId_fkey',
  })
  user!: User;

  @Column({ type: 'text' })
  flightInstanceId!: string;

  @ManyToOne(() => FlightInstance, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'flightInstanceId',
    foreignKeyConstraintName: 'saved_flights_flightInstanceId_fkey',
  })
  flightInstance!: FlightInstance;

  @Column({ type: 'enum', enum: CabinClass, enumName: 'CabinClass' })
  cabin!: CabinClass;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
