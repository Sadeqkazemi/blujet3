import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { AgencyTier } from '../enums';
import { User } from './user.entity';

@Entity('agency_profiles')
export class AgencyProfile {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_profiles_pkey',
  })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'agency_profiles_userId_fkey',
  })
  user!: User;

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

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  joinedAt!: Date;
}
