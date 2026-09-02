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
import { Booking } from './booking.entity';
import { User } from './user.entity';

@Index('pay_idempotency_records_bookingId_idx', ['bookingId'])
@Index('pay_idempotency_records_idempotencyKey_key', ['idempotencyKey'], {
  unique: true,
})
@Entity('pay_idempotency_records')
export class PayIdempotencyRecord {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'pay_idempotency_records_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  idempotencyKey!: string;

  @Column({ type: 'text' })
  bookingId!: string;

  @ManyToOne(() => Booking, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'bookingId',
    foreignKeyConstraintName: 'pay_idempotency_records_bookingId_fkey',
  })
  booking!: Booking;

  @Column({ type: 'text' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'pay_idempotency_records_userId_fkey',
  })
  user!: User;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
