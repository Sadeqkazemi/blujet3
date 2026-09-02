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
import { CabinClass } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { FlightInstance } from './flight-instance.entity';

@Index(
  'cabin_fares_flightInstanceId_cabin_key',
  ['flightInstanceId', 'cabin'],
  { unique: true },
)
@Entity('cabin_fares')
export class CabinFare {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'cabin_fares_pkey' })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  flightInstanceId!: string;

  @ManyToOne(() => FlightInstance, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'flightInstanceId',
    foreignKeyConstraintName: 'cabin_fares_flightInstanceId_fkey',
  })
  flightInstance!: FlightInstance;

  @Column({ type: 'enum', enum: CabinClass, enumName: 'CabinClass' })
  cabin!: CabinClass;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  priceIrr!: bigint;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
