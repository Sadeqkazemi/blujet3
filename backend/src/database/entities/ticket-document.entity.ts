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
import type { JsonValue } from '../json-types';
import { Booking } from './booking.entity';
import { Passenger } from './passenger.entity';
import { TicketDocumentStock } from './ticket-document-stock.entity';

export type TicketIssueSource =
  | 'PUBLIC_PAYMENT'
  | 'AGENCY_ALLOTMENT'
  | 'STAFF_MANUAL'
  | 'MANAGERIAL_LOCK'
  | 'LEGACY_PASSENGER';

@Entity('ticket_documents', { schema: 'orders' })
@Index('ticket_documents_documentNumber_key', ['documentNumber'], {
  unique: true,
})
@Index('ticket_documents_passengerId_key', ['passengerId'], { unique: true })
@Index('ticket_documents_bookingId_idx', ['bookingId'])
@Check('ticket_documents_status_check', `"status" IN ('ISSUED')`)
@Check(
  'ticket_documents_accountability_check',
  `"accountabilityStatus" IN ('ACCOUNTABLE', 'QUARANTINED')`,
)
@Check('ticket_documents_number_check', `"documentNumber" ~ '^[0-9]{13}$'`)
@Check(
  'ticket_documents_stock_accountability_check',
  `("accountabilityStatus" = 'ACCOUNTABLE' AND "stockId" IS NOT NULL) OR ("accountabilityStatus" = 'QUARANTINED' AND "stockId" IS NULL)`,
)
@Check(
  'ticket_documents_issue_source_check',
  `"issueSource" IN ('PUBLIC_PAYMENT', 'AGENCY_ALLOTMENT', 'STAFF_MANUAL', 'MANAGERIAL_LOCK', 'LEGACY_PASSENGER')`,
)
export class TicketDocument {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'ticket_documents_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  bookingId!: string;

  @ManyToOne(() => Booking, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'bookingId',
    foreignKeyConstraintName: 'ticket_documents_bookingId_fkey',
  })
  booking!: Booking;

  @Column({ type: 'text' })
  passengerId!: string;

  @ManyToOne(() => Passenger, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'passengerId',
    foreignKeyConstraintName: 'ticket_documents_passengerId_fkey',
  })
  passenger!: Passenger;

  @Column({ type: 'text', nullable: true })
  stockId!: string | null;

  @ManyToOne(() => TicketDocumentStock, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'stockId',
    foreignKeyConstraintName: 'ticket_documents_stockId_fkey',
  })
  stock!: TicketDocumentStock | null;

  @Column({ type: 'text' })
  documentNumber!: string;

  @Column({ type: 'text', default: 'ISSUED' })
  status!: 'ISSUED';

  @Column({ type: 'text' })
  accountabilityStatus!: 'ACCOUNTABLE' | 'QUARANTINED';

  @Column({ type: 'text' })
  issueSource!: TicketIssueSource;

  @Column({ type: 'text', nullable: true })
  paymentReference!: string | null;

  @Column({ type: 'jsonb' })
  issueSnapshot!: JsonValue;

  @Column({ type: 'timestamp', precision: 3 })
  issuedAt!: Date;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
