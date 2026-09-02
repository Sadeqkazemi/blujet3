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
import { CustomerIdentityStatus } from '../enums';
import { User } from './user.entity';

@Index('customer_identity_verifications_userId_key', ['userId'], {
  unique: true,
})
@Entity('customer_identity_verifications')
export class CustomerIdentityVerification {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'customer_identity_verifications_pkey',
  })
  id!: string;

  @BeforeInsert()
  generateId() {
    this.id ??= randomUUID();
  }

  @Column({ type: 'text' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'customer_identity_verifications_userId_fkey',
  })
  user!: User;

  @Column({
    type: 'enum',
    enum: CustomerIdentityStatus,
    enumName: 'CustomerIdentityStatus',
    default: CustomerIdentityStatus.NOT_STARTED,
  })
  status!: CustomerIdentityStatus;

  @Column({ type: 'text', nullable: true })
  idCardFileId!: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  submittedAt!: Date | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  rejectReason!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', precision: 3 })
  updatedAt!: Date;
}
