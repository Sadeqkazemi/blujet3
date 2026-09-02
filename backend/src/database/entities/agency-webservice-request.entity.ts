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
import { AgencyApiScope, AgencyWebserviceRequestStatus } from '../enums';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { AgencyProfile } from './agency-profile.entity';
import { User } from './user.entity';

@Index('agency_webservice_requests_agencyId_status_idx', ['agencyId', 'status'])
@Entity('agency_webservice_requests')
export class AgencyWebserviceRequest {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_webservice_requests_pkey',
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
    foreignKeyConstraintName: 'agency_webservice_requests_agencyId_fkey',
  })
  agency!: AgencyProfile;

  @Column({ type: 'enum', enum: AgencyApiScope, enumName: 'AgencyApiScope' })
  scope!: AgencyApiScope;

  @Column({ type: 'int' })
  months!: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  priceIrr!: bigint;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({
    type: 'enum',
    enum: AgencyWebserviceRequestStatus,
    enumName: 'AgencyWebserviceRequestStatus',
    default: AgencyWebserviceRequestStatus.PENDING,
  })
  status!: AgencyWebserviceRequestStatus;

  @Column({ type: 'text', nullable: true })
  decidedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'decidedById',
    foreignKeyConstraintName: 'agency_webservice_requests_decidedById_fkey',
  })
  decidedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  decidedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
