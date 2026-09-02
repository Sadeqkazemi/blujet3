import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../transformers/bigint.transformer';
import { AgencyProfile } from './agency-profile.entity';
import { User } from './user.entity';

@Entity('agency_credit_lines')
export class AgencyCreditLine {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_credit_lines_pkey',
  })
  agencyId!: string;

  @ManyToOne(() => AgencyProfile, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'agencyId',
    foreignKeyConstraintName: 'agency_credit_lines_agencyId_fkey',
  })
  agency!: AgencyProfile;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  limitIrr!: bigint;

  @Column({ type: 'text', nullable: true })
  updatedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'updatedById',
    foreignKeyConstraintName: 'agency_credit_lines_updatedById_fkey',
  })
  updatedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
