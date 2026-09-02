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
import {
  AgencyApiEnvironment,
  AgencyApiKeyStatus,
  AgencyApiScope,
  AgencyFlightDomain,
  type AgencyApiCapability,
} from '../enums';
import { AgencyProfile } from './agency-profile.entity';

@Index('agency_api_keys_agencyId_idx', ['agencyId'])
@Index('agency_api_keys_keyHash_key', ['keyHash'], { unique: true })
@Index('agency_api_keys_agency_env_active_idx', ['agencyId', 'environment'], {
  unique: true,
  where: `"status" IN ('ACTIVE', 'SUSPENDED')`,
})
@Entity('agency_api_keys')
export class AgencyApiKey {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'agency_api_keys_pkey',
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
    foreignKeyConstraintName: 'agency_api_keys_agencyId_fkey',
  })
  agency!: AgencyProfile;

  @Column({ type: 'text' })
  keyHash!: string;

  @Column({ type: 'enum', enum: AgencyApiScope, enumName: 'AgencyApiScope' })
  scope!: AgencyApiScope;

  /** Fine-grained scopes for IT policy UI; partner routes still use `scope`. */
  @Column({ type: 'text', array: true, default: '{}' })
  capabilities!: AgencyApiCapability[];

  @Column({
    type: 'enum',
    enum: AgencyApiEnvironment,
    enumName: 'AgencyApiEnvironment',
    default: AgencyApiEnvironment.SANDBOX,
  })
  environment!: AgencyApiEnvironment;

  @Column({
    type: 'enum',
    enum: AgencyFlightDomain,
    enumName: 'AgencyFlightDomain',
    default: AgencyFlightDomain.ALL,
  })
  flightDomain!: AgencyFlightDomain;

  /** Empty = no IP restriction. Entries are exact IPv4/IPv6 strings. */
  @Column({ type: 'text', array: true, default: '{}' })
  ipWhitelist!: string[];

  /** Null = rely on global Nest throttler only. */
  @Column({ type: 'int', nullable: true })
  rateLimitPerMinute!: number | null;

  @Column({
    type: 'enum',
    enum: AgencyApiKeyStatus,
    enumName: 'AgencyApiKeyStatus',
    default: AgencyApiKeyStatus.ACTIVE,
  })
  status!: AgencyApiKeyStatus;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  activatedAt!: Date;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  lastUsedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  callCount!: number;
}
