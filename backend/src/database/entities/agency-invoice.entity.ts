import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { AgencyInvoiceStatus } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { AgencyProfile } from './agency-profile.entity';
import { Booking } from './booking.entity';
import { User } from './user.entity';

@Index('agency_invoices_agencyId_status_idx', ['agencyId', 'status'])
@Index('agency_invoices_invoiceNo_key', ['invoiceNo'], { unique: true })
@Index('agency_invoices_bookingId_key', ['bookingId'], { unique: true })
@Check('agency_invoices_version_check', '"version" > 0')
@Entity('agency_invoices', { schema: 'agency' })
export class AgencyInvoice {
  #recordVersion!: number;

  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_invoices_pkey',
  })
  id!: string;

  /** Internal source revision; excluded from default reads and JSON responses. */
  @Column({ type: 'int', default: 1, select: false, update: false })
  get version(): number {
    return this.#recordVersion;
  }

  set version(value: number) {
    this.#recordVersion = value;
  }

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  agencyId!: string;

  @Column({ type: 'text', nullable: true })
  bookingId!: string | null;

  @ManyToOne(() => Booking, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'bookingId',
    foreignKeyConstraintName: 'agency_invoices_bookingId_fkey',
  })
  booking!: Booking | null;

  @ManyToOne(() => AgencyProfile, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'agencyId',
    foreignKeyConstraintName: 'agency_invoices_agencyId_fkey',
  })
  agency!: AgencyProfile;

  @Column({ type: 'text' })
  invoiceNo!: string;

  @Column({ type: 'text' })
  issuedById!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'issuedById',
    foreignKeyConstraintName: 'agency_invoices_issuedById_fkey',
  })
  issuedBy!: User;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  issuedAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  dueAt!: Date;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amountIrr!: bigint;

  @Column({ type: 'text', nullable: true })
  descriptionFa!: string | null;

  @Column({
    type: 'enum',
    enum: AgencyInvoiceStatus,
    enumName: 'AgencyInvoiceStatus',
    default: AgencyInvoiceStatus.UNPAID,
  })
  status!: AgencyInvoiceStatus;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  paidAt!: Date | null;
}
