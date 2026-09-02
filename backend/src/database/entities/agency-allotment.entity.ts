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
import { AllotmentType, CabinClass } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { AgencyProfile } from './agency-profile.entity';
import { FlightInstance } from './flight-instance.entity';
import { User } from './user.entity';

@Entity('agency_allotments')
@Index(
  'agency_allotments_seatRequestId_flightInstanceId_key',
  ['seatRequestId', 'flightInstanceId'],
  { unique: true, where: '"seatRequestId" IS NOT NULL' },
)
export class AgencyAllotment {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_allotments_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  agencyId!: string;

  @ManyToOne(() => AgencyProfile, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'agencyId',
    foreignKeyConstraintName: 'agency_allotments_agencyId_fkey',
  })
  agency!: AgencyProfile;

  @Column({ type: 'text' })
  flightInstanceId!: string;

  @ManyToOne(() => FlightInstance, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'flightInstanceId',
    foreignKeyConstraintName: 'agency_allotments_flightInstanceId_fkey',
  })
  flightInstance!: FlightInstance;

  /** Null only for legacy/manual allotments created before class-bound sales. */
  @Column({
    type: 'enum',
    enum: CabinClass,
    enumName: 'CabinClass',
    nullable: true,
  })
  cabin!: CabinClass | null;

  @Column({ type: 'text', nullable: true })
  fareClassCode!: string | null;

  /** Source request; null for manual commercial allotments. */
  @Column({ type: 'text', nullable: true })
  seatRequestId!: string | null;

  @Column({ type: 'int' })
  seatsAllocated!: number;

  @Column({
    type: 'enum',
    enum: AllotmentType,
    enumName: 'AllotmentType',
    default: AllotmentType.HARD,
  })
  type!: AllotmentType;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  releaseAt!: Date | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  contractPriceIrr!: bigint | null;

  @Column({ type: 'text' })
  createdById!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'agency_allotments_createdById_fkey',
  })
  createdBy!: User;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
