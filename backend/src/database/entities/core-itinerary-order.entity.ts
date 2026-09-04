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
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { BookingChannel, BookingStatus } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { User } from './user.entity';

@Index('core_itinerary_orders_pnr_key', ['pnr'], { unique: true })
@Index('core_itinerary_orders_idempotencyKey_key', ['idempotencyKey'], {
  unique: true,
})
@Index('core_itinerary_orders_due_expiry_idx', ['holdExpiresAt', 'id'], {
  where: `"status" = 'HELD'`,
})
@Entity('core_itinerary_orders', { schema: 'orders' })
export class CoreItineraryOrder {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'core_itinerary_orders_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  pnr!: string;

  @Column({ type: 'enum', enum: BookingChannel, enumName: 'BookingChannel' })
  channel!: BookingChannel;

  /** Customer id for SYSTEM, agency id for AGENCY. */
  @Column({ type: 'text' })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'ownerId',
    foreignKeyConstraintName: 'core_itinerary_orders_ownerId_fkey',
  })
  owner!: User;

  @Column({ type: 'text', nullable: true })
  contactPhone!: string | null;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    enumName: 'BookingStatus',
    default: BookingStatus.HELD,
  })
  status!: BookingStatus;

  @Column({ type: 'text', default: 'IRR' })
  currency!: 'IRR';

  @Column({ type: 'bigint', transformer: bigintTransformer })
  fareIrr!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  taxIrr!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  extrasIrr!: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  totalIrr!: bigint;

  @Column({ type: 'timestamp', precision: 3 })
  holdExpiresAt!: Date;

  @Column({ type: 'text' })
  idempotencyKey!: string;

  @Column({ type: 'text', select: false })
  idempotencyRequestHash!: string;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
