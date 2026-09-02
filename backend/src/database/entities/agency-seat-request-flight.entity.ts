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
import { AgencySeatRequest } from './agency-seat-request.entity';
import { FlightInstance } from './flight-instance.entity';

@Index(
  'agency_seat_request_flights_seatRequestId_flightInstanceId_key',
  ['seatRequestId', 'flightInstanceId'],
  { unique: true },
)
@Index('agency_seat_request_flights_flightInstanceId_idx', ['flightInstanceId'])
@Entity('agency_seat_request_flights')
export class AgencySeatRequestFlight {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_seat_request_flights_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  seatRequestId!: string;

  @ManyToOne(() => AgencySeatRequest, (request) => request.flights, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'seatRequestId',
    foreignKeyConstraintName: 'agency_seat_request_flights_seatRequestId_fkey',
  })
  seatRequest!: AgencySeatRequest;

  @Column({ type: 'text' })
  flightInstanceId!: string;

  @ManyToOne(() => FlightInstance, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'flightInstanceId',
    foreignKeyConstraintName:
      'agency_seat_request_flights_flightInstanceId_fkey',
  })
  flightInstance!: FlightInstance;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
