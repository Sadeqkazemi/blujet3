import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';
import { AgencyTier } from '../agency.enums';

@Check('agency_profiles_version_check', '"version" > 0')
@Entity('agency_profiles', { schema: 'agency' })
export class AgencyProfile {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_profiles_pkey',
  })
  userId!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'text' })
  licenseNo!: string;

  @Column({ type: 'text' })
  managerName!: string;

  @Column({ type: 'text' })
  phone!: string;

  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'text' })
  city!: string;

  @Column({ type: 'text' })
  address!: string;

  @Column({
    type: 'enum',
    enum: AgencyTier,
    enumName: 'AgencyTier',
    default: AgencyTier.NORMAL,
  })
  tier!: AgencyTier;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  suspendedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  suspendReason!: string | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3, default: () => 'now()' })
  joinedAt!: Date;
}
