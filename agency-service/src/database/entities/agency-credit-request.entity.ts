import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { AgencyCreditRequestStatus } from '../agency.enums';
import { AgencyProfile } from './agency-profile.entity';

@Index('agency_credit_requests_agencyId_status_idx', ['agencyId', 'status'])
@Entity('agency_credit_requests', { schema: 'agency' })
export class AgencyCreditRequest {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_credit_requests_pkey',
  })
  id!: string;

  @Column({ type: 'text' })
  agencyId!: string;

  @ManyToOne(() => AgencyProfile, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'agencyId',
    referencedColumnName: 'userId',
    foreignKeyConstraintName: 'agency_credit_requests_agencyId_fkey',
  })
  agency!: AgencyProfile;

  @Column({ type: 'bigint' })
  requestedLimitIrr!: string;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({
    type: 'enum',
    enum: AgencyCreditRequestStatus,
    enumName: 'AgencyCreditRequestStatus',
    default: AgencyCreditRequestStatus.PENDING,
  })
  status!: AgencyCreditRequestStatus;

  @Column({ type: 'text', nullable: true })
  decidedById!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  decidedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3, default: () => 'now()' })
  createdAt!: Date;
}
