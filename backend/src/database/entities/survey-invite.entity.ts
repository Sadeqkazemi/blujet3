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
import { FlightInstance } from './flight-instance.entity';

@Index('survey_invites_bookingId_key', ['bookingId'], { unique: true })
@Index('survey_invites_flightInstanceId_idx', ['flightInstanceId'])
@Index('survey_invites_token_key', ['token'], { unique: true })
@Entity('survey_invites')
export class SurveyInvite {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'survey_invites_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  bookingId!: string;

  @ManyToOne(() => Booking, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'bookingId',
    foreignKeyConstraintName: 'survey_invites_bookingId_fkey',
  })
  booking!: Booking;

  @Column({ type: 'text' })
  flightInstanceId!: string;

  @ManyToOne(() => FlightInstance, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'flightInstanceId',
    foreignKeyConstraintName: 'survey_invites_flightInstanceId_fkey',
  })
  flightInstance!: FlightInstance;

  @Column({ type: 'text' })
  token!: string;

  @BeforeInsert()
  generateToken() {
    this.token ??= randomUUID();
  }

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  smsSentAt!: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  respondedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
