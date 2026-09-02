import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { FlightReviewDecision, FlightReviewStage } from '../enums';
import { FlightInstance } from './flight-instance.entity';
import { User } from './user.entity';

/** Append-only operations / CEO review decisions for a flight definition. */
@Index('flight_reviews_flightInstanceId_reviewedAt_idx', [
  'flightInstanceId',
  'reviewedAt',
])
@Entity('flight_reviews')
export class FlightReview {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'flight_reviews_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  flightInstanceId!: string;

  @ManyToOne(() => FlightInstance, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'flightInstanceId',
    foreignKeyConstraintName: 'flight_reviews_flightInstanceId_fkey',
  })
  flightInstance!: FlightInstance;

  @Column({
    type: 'enum',
    enum: FlightReviewStage,
    enumName: 'FlightReviewStage',
  })
  stage!: FlightReviewStage;

  @Column({
    type: 'enum',
    enum: FlightReviewDecision,
    enumName: 'FlightReviewDecision',
  })
  decision!: FlightReviewDecision;

  @Column({ type: 'text' })
  comment!: string;

  @Column({ type: 'text' })
  reviewedByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'reviewedByUserId',
    foreignKeyConstraintName: 'flight_reviews_reviewedByUserId_fkey',
  })
  reviewedBy!: User;

  @Column({ type: 'timestamp', precision: 3 })
  reviewedAt!: Date;

  @Column({ type: 'int', nullable: true })
  expectedVersion!: number | null;

  @Column({
    type: 'timestamp',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;
}
