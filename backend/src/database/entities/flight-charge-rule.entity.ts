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
} from 'typeorm';
import { CabinClass, ChargeCalculationMode, ChargeKind } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { FlightInstance } from './flight-instance.entity';

/**
 * Server-authoritative tax/fee rule attached to a flight instance.
 * `cabin = null` means the rule applies to every cabin.
 * Pending revisions store rules with `isPendingRevision = true` until CEO
 * approval promotes them to active (`isPendingRevision = false`).
 */
@Index('flight_charge_rules_flightInstanceId_idx', ['flightInstanceId'])
@Index('flight_charge_rules_active_idx', [
  'flightInstanceId',
  'isActive',
  'isPendingRevision',
])
@Entity('flight_charge_rules')
export class FlightChargeRule {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'flight_charge_rules_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  flightInstanceId!: string;

  @ManyToOne(() => FlightInstance, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'flightInstanceId',
    foreignKeyConstraintName: 'flight_charge_rules_flightInstanceId_fkey',
  })
  flightInstance!: FlightInstance;

  @Column({ type: 'text' })
  title!: string;

  @Column({
    type: 'enum',
    enum: ChargeKind,
    enumName: 'ChargeKind',
  })
  kind!: ChargeKind;

  @Column({
    type: 'enum',
    enum: ChargeCalculationMode,
    enumName: 'ChargeCalculationMode',
  })
  calculationMode!: ChargeCalculationMode;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  fixedAmountIrr!: bigint | null;

  /** Basis points: 1000 = 10.00%. */
  @Column({ type: 'int', nullable: true })
  percentageBasisPoints!: number | null;

  @Column({
    type: 'enum',
    enum: CabinClass,
    enumName: 'CabinClass',
    nullable: true,
  })
  cabin!: CabinClass | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  effectiveFrom!: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  effectiveTo!: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /** True while waiting in a PENDING_REVISION snapshot; not used at booking. */
  @Column({ type: 'boolean', default: false })
  isPendingRevision!: boolean;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ precision: 3 })
  updatedAt!: Date;
}
