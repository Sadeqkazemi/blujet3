import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('commerce_inbox_receipts', { schema: 'orders' })
export class CommerceInboxReceipt {
  @PrimaryColumn({
    type: 'varchar',
    length: 128,
    primaryKeyConstraintName: 'commerce_inbox_receipts_pkey',
  })
  consumer!: string;

  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'commerce_inbox_receipts_pkey',
  })
  eventId!: string;

  @Column({ type: 'varchar', length: 64 })
  fingerprint!: string;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
    default: () => 'now()',
  })
  receivedAt!: Date;
}
