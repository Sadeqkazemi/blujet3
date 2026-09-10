import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { AgencyInvoiceStatus } from '../agency.enums';
import { AgencyProfile } from './agency-profile.entity';

@Index('agency_invoices_agencyId_status_idx', ['agencyId', 'status'])
@Index('agency_invoices_bookingId_key', ['bookingId'], { unique: true })
@Index('agency_invoices_invoiceNo_key', ['invoiceNo'], { unique: true })
@Entity('agency_invoices', { schema: 'agency' })
export class AgencyInvoice {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_invoices_pkey',
  })
  id!: string;

  @Column({ type: 'text' })
  agencyId!: string;

  @ManyToOne(() => AgencyProfile, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'agencyId',
    referencedColumnName: 'userId',
    foreignKeyConstraintName: 'agency_invoices_agencyId_fkey',
  })
  agency!: AgencyProfile;

  @Column({ type: 'text' })
  invoiceNo!: string;

  @Column({ type: 'text' })
  issuedById!: string;

  @CreateDateColumn({ type: 'timestamp', precision: 3, default: () => 'now()' })
  issuedAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  dueAt!: Date;

  @Column({ type: 'bigint' })
  amountIrr!: string;

  @Column({
    type: 'enum',
    enum: AgencyInvoiceStatus,
    enumName: 'AgencyInvoiceStatus',
    default: AgencyInvoiceStatus.UNPAID,
  })
  status!: AgencyInvoiceStatus;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  paidAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  descriptionFa!: string | null;

  @Column({ type: 'text', nullable: true })
  bookingId!: string | null;
}
