import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  VersionColumn,
} from 'typeorm';
import { AgencyTier } from '../enums';
import { User } from './user.entity';

@Check('agency_profiles_version_check', '"version" > 0')
@Entity('agency_profiles', { schema: 'agency' })
export class AgencyProfile {
  #recordVersion = 1;

  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_profiles_pkey',
  })
  userId!: string;

  /** Stored as a TypeORM revision while remaining absent from JSON responses. */
  @VersionColumn({ type: 'int', default: 1 })
  get version(): number {
    return this.#recordVersion;
  }

  set version(value: number) {
    this.#recordVersion = value;
  }

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
