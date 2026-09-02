import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { EmployeeReferralScope, Locale, Role } from '../enums';
import { RefreshToken } from './refresh-token.entity';

@Index('users_email_key', ['email'], { unique: true })
@Index('users_nationalIdHash_idx', ['nationalIdHash'])
@Index('users_phone_key', ['phone'], { unique: true })
@Index('users_referralCode_key', ['referralCode'], { unique: true })
@Index('users_username_key', ['username'], { unique: true })
@Index('users_one_active_super_admin_idx', ['isSuperAdmin'], {
  unique: true,
  where: '"isSuperAdmin" = true AND "deletedAt" IS NULL',
})
@Entity('users')
export class User {
  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'users_pkey' })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'enum', enum: Role, enumName: 'Role' })
  role!: Role;

  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  username!: string | null;

  @Column({ type: 'text', nullable: true })
  passwordHash!: string | null;

  @Column({ type: 'text', nullable: true })
  email!: string | null;

  @Column({ type: 'text' })
  fullName!: string;

  @Column({ type: 'boolean', default: false })
  twoFactorEnabled!: boolean;

  @Column({ type: 'boolean', default: false })
  isSuperAdmin!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  panelPermissions!: string[] | null;

  @Column({ type: 'text', nullable: true })
  twoFactorSecret!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  temporaryPasswordOnlyUntil!: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;

  @Column({ type: 'text', nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'users_createdById_fkey',
  })
  createdBy!: User | null;

  @Column({ type: 'text', nullable: true })
  dept!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  lastLoginAt!: Date | null;

  @Column({ type: 'boolean', default: false })
  mustChangePassword!: boolean;

  @Column({ type: 'text', nullable: true })
  rank!: string | null;

  @Column({
    type: 'enum',
    enum: EmployeeReferralScope,
    enumName: 'EmployeeReferralScope',
    nullable: true,
  })
  referralScope!: EmployeeReferralScope | null;

  @Column({ type: 'text', nullable: true })
  nationalIdEnc!: string | null;

  @Column({ type: 'text', nullable: true })
  nationalIdHash!: string | null;

  @Column({ type: 'text', nullable: true })
  passportNoEnc!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  birthDate!: Date | null;

  /** Customer residence/postal address. PII: AES-256-GCM encrypted at rest. */
  @Column({ type: 'text', nullable: true })
  addressEnc!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({
    type: 'enum',
    enum: Locale,
    enumName: 'Locale',
    default: Locale.FA,
  })
  preferredLocale!: Locale;

  @Column({ type: 'text', nullable: true })
  referralCode!: string | null;

  @OneToMany(() => RefreshToken, (rt) => rt.user)
  refreshTokens!: RefreshToken[];
}
