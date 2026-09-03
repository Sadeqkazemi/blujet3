import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../transformers/bigint.transformer';

export type TicketDocumentStockStatus = 'ACTIVE' | 'EXHAUSTED' | 'QUARANTINED';

@Entity('ticket_document_stocks', { schema: 'orders' })
@Index('ticket_document_stocks_allocation_idx', [
  'documentType',
  'status',
  'startSerial',
])
@Check('ticket_document_stocks_type_check', `"documentType" IN ('ETICKET')`)
@Check(
  'ticket_document_stocks_status_check',
  `"status" IN ('ACTIVE', 'EXHAUSTED', 'QUARANTINED')`,
)
@Check(
  'ticket_document_stocks_airline_code_check',
  `"airlineNumericCode" ~ '^[0-9]{3}$'`,
)
@Check(
  'ticket_document_stocks_serials_check',
  `"startSerial" >= 0 AND "endSerial" <= 9999999999 AND "startSerial" <= "endSerial" AND "nextSerial" >= "startSerial" AND "nextSerial" <= "endSerial" + 1`,
)
export class TicketDocumentStock {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'ticket_document_stocks_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  documentType!: 'ETICKET';

  @Column({ type: 'text' })
  airlineNumericCode!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  startSerial!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  endSerial!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  nextSerial!: bigint;

  @Column({ type: 'text', default: 'ACTIVE' })
  status!: TicketDocumentStockStatus;

  @Column({ type: 'text' })
  sourceAuthority!: string;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
