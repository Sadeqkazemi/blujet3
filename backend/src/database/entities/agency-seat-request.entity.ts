import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AgencySeatRequestPayMethod,
  AgencySeatRequestStatus,
  CabinClass,
} from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { AgencyInvoice } from './agency-invoice.entity';
import { AgencySeatRequestFlight } from './agency-seat-request-flight.entity';
import { Route } from './route.entity';
import { User } from './user.entity';

@Index('agency_seat_requests_agencyId_status_idx', ['agencyId', 'status'])
@Index('agency_seat_requests_status_createdAt_idx', ['status', 'createdAt'])
@Entity('agency_seat_requests')
export class AgencySeatRequest {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_seat_requests_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  /** Agency user id (`AgencyProfile.userId`). Indexed; no FK so the UAT
   * sandbox identity (no profile row) can still persist a request. */
  @Column({ type: 'text' })
  agencyId!: string;

  @Column({ type: 'text', nullable: true })
  routeId!: string | null;

  @ManyToOne(() => Route, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'routeId',
    foreignKeyConstraintName: 'agency_seat_requests_routeId_fkey',
  })
  route!: Route | null;

  @Column({ type: 'text' })
  aircraftType!: string;

  @Column({
    type: 'enum',
    enum: CabinClass,
    enumName: 'CabinClass',
    nullable: true,
  })
  cabin!: CabinClass | null;

  @Column({ type: 'text', nullable: true })
  fareClassCode!: string | null;

  @Column({ type: 'int' })
  seats!: number;

  /** 0 = weekly; 1 | 3 | 6 | 12 are months. Null is a legacy single flight. */
  @Column({ type: 'smallint', nullable: true })
  termMonths!: number | null;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  unitPriceIrr!: bigint;

  @Column({
    type: 'enum',
    enum: AgencySeatRequestPayMethod,
    enumName: 'AgencySeatRequestPayMethod',
    default: AgencySeatRequestPayMethod.INVOICE,
  })
  payMethod!: AgencySeatRequestPayMethod;

  @Column({
    type: 'enum',
    enum: AgencySeatRequestStatus,
    enumName: 'AgencySeatRequestStatus',
    default: AgencySeatRequestStatus.PENDING,
  })
  status!: AgencySeatRequestStatus;

  @Column({ type: 'text', nullable: true })
  invoiceId!: string | null;

  @ManyToOne(() => AgencyInvoice, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'invoiceId',
    foreignKeyConstraintName: 'agency_seat_requests_invoiceId_fkey',
  })
  invoice!: AgencyInvoice | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  dueAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  decidedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'decidedById',
    foreignKeyConstraintName: 'agency_seat_requests_decidedById_fkey',
  })
  decidedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  decidedAt!: Date | null;

  @OneToMany(() => AgencySeatRequestFlight, (row) => row.seatRequest)
  flights!: AgencySeatRequestFlight[];

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ precision: 3 })
  updatedAt!: Date;
}
