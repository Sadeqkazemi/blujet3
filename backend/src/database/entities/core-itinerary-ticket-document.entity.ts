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
import { CoreItineraryOrder } from './core-itinerary-order.entity';
import { CoreItineraryTraveller } from './core-itinerary-traveller.entity';
import { TicketDocumentStock } from './ticket-document-stock.entity';

@Entity('core_itinerary_ticket_documents', { schema: 'orders' })
@Index(
  'core_itinerary_ticket_documents_documentNumber_key',
  ['documentNumber'],
  {
    unique: true,
  },
)
@Index('core_itinerary_ticket_documents_travellerId_key', ['travellerId'], {
  unique: true,
})
@Index('core_itinerary_ticket_documents_orderId_idx', ['orderId'])
@Check('core_itinerary_ticket_documents_status_check', `"status" IN ('ISSUED')`)
@Check(
  'core_itinerary_ticket_documents_accountability_check',
  `"accountabilityStatus" IN ('ACCOUNTABLE')`,
)
@Check(
  'core_itinerary_ticket_documents_number_check',
  `"documentNumber" ~ '^[0-9]{13}$'`,
)
@Check(
  'core_itinerary_ticket_documents_source_check',
  `"issueSource" IN ('CORE_ITINERARY_PAYMENT')`,
)
export class CoreItineraryTicketDocument {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'core_itinerary_ticket_documents_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  orderId!: string;

  @ManyToOne(() => CoreItineraryOrder, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'orderId',
    foreignKeyConstraintName: 'core_itinerary_ticket_documents_orderId_fkey',
  })
  order!: CoreItineraryOrder;

  @Column({ type: 'text' })
  travellerId!: string;

  @ManyToOne(() => CoreItineraryTraveller, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'travellerId',
    foreignKeyConstraintName:
      'core_itinerary_ticket_documents_travellerId_fkey',
  })
  traveller!: CoreItineraryTraveller;

  @Column({ type: 'text' })
  stockId!: string;

  @ManyToOne(() => TicketDocumentStock, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'stockId',
    foreignKeyConstraintName: 'core_itinerary_ticket_documents_stockId_fkey',
  })
  stock!: TicketDocumentStock;

  @Column({ type: 'text' })
  documentNumber!: string;

  @Column({ type: 'text', default: 'ISSUED' })
  status!: 'ISSUED';

  @Column({ type: 'text', default: 'ACCOUNTABLE' })
  accountabilityStatus!: 'ACCOUNTABLE';

  @Column({ type: 'text', default: 'CORE_ITINERARY_PAYMENT' })
  issueSource!: 'CORE_ITINERARY_PAYMENT';

  @Column({ type: 'text' })
  paymentReference!: string;

  @Column({ type: 'jsonb' })
  issueSnapshot!: JsonValue;

  @Column({ type: 'timestamp', precision: 3 })
  issuedAt!: Date;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
