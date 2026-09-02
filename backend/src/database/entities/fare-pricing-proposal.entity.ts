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
import { PricingProposalStatus } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import type { JsonValue } from '../json-types';
import { FlightInstance } from './flight-instance.entity';
import { User } from './user.entity';

@Index('fare_pricing_proposals_flightInstanceId_key', ['flightInstanceId'], {
  unique: true,
})
@Index('fare_pricing_proposals_status_idx', ['status'])
@Entity('fare_pricing_proposals')
export class FarePricingProposal {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'fare_pricing_proposals_pkey',
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
    foreignKeyConstraintName: 'fare_pricing_proposals_flightInstanceId_fkey',
  })
  flightInstance!: FlightInstance;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  basePriceIrr!: bigint;

  /** Optional competitor observation — null means unknown (UI shows «—»). */
  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  competitorPriceIrr!: bigint | null;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  proposedPriceIrr!: bigint;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  legalRateIrr!: bigint | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'text', nullable: true })
  ceoNote!: string | null;

  @Column({ type: 'text', nullable: true })
  operationsNote!: string | null;

  @Column({ type: 'text', nullable: true })
  commercialNote!: string | null;

  @Column({ type: 'text' })
  proposedById!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'proposedById',
    foreignKeyConstraintName: 'fare_pricing_proposals_proposedById_fkey',
  })
  proposedBy!: User;

  @Column({
    type: 'enum',
    enum: PricingProposalStatus,
    enumName: 'PricingProposalStatus',
    default: PricingProposalStatus.PENDING,
  })
  status!: PricingProposalStatus;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  registeredPriceIrr!: bigint | null;

  @Column({ type: 'text', nullable: true })
  approvedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'approvedById',
    foreignKeyConstraintName: 'fare_pricing_proposals_approvedById_fkey',
  })
  approvedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'text', nullable: true })
  rejectedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'rejectedById',
    foreignKeyConstraintName: 'fare_pricing_proposals_rejectedById_fkey',
  })
  rejectedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  rejectedAt!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  aiSuggestion!: JsonValue | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
