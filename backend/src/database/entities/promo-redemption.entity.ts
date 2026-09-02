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
import { bigintTransformer } from '../transformers/bigint.transformer';
import { Booking } from './booking.entity';
import { PromoCode } from './promo-code.entity';
import { User } from './user.entity';

@Index('promo_redemptions_bookingId_key', ['bookingId'], { unique: true })
@Index('promo_redemptions_promoCodeId_idx', ['promoCodeId'])
@Index('promo_redemptions_userId_idx', ['userId'])
@Entity('promo_redemptions')
export class PromoRedemption {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'promo_redemptions_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  promoCodeId!: string;

  @ManyToOne(() => PromoCode, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'promoCodeId',
    foreignKeyConstraintName: 'promo_redemptions_promoCodeId_fkey',
  })
  promoCode!: PromoCode;

  @Column({ type: 'text' })
  bookingId!: string;

  @ManyToOne(() => Booking, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'bookingId',
    foreignKeyConstraintName: 'promo_redemptions_bookingId_fkey',
  })
  booking!: Booking;

  @Column({ type: 'text' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'promo_redemptions_userId_fkey',
  })
  user!: User;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  discountIrr!: bigint;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
