import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('security_policy')
export class SecurityPolicy {
  @PrimaryColumn({
    type: 'int',
    default: 1,
    primaryKeyConstraintName: 'security_policy_pkey',
  })
  id!: number;

  @Column({ type: 'int', default: 10 })
  minLength!: number;

  @Column({ type: 'int', default: 90 })
  expiryDays!: number;

  @Column({ type: 'int', default: 5 })
  maxAttempts!: number;

  @Column({ type: 'boolean', default: true })
  requireUppercase!: boolean;

  @Column({ type: 'boolean', default: true })
  requireNumber!: boolean;

  @Column({ type: 'boolean', default: true })
  requireSymbol!: boolean;

  @Column({ type: 'boolean', default: true })
  blockReuse!: boolean;

  @Column({ type: 'boolean', default: true })
  staffTwoFactorMandatory!: boolean;

  @Column({ type: 'text', nullable: true })
  updatedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'updatedById',
    foreignKeyConstraintName: 'security_policy_updatedById_fkey',
  })
  updatedBy!: User | null;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
