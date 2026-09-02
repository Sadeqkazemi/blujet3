import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../transformers/bigint.transformer';
import type { JsonValue } from '../json-types';
import { User } from './user.entity';

export type BankMembershipStatus =
  | 'UNDECLARED'
  | 'BANK_CUSTOMER'
  | 'ACCOUNT_OPENING_REQUESTED'
  | 'ACCOUNT_OPENED';

export type BankAccountOpeningStatus =
  | 'NOT_STARTED'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'COMPLETED'
  | 'REJECTED'
  | 'FAILED';

export type BankEligibilityStatus =
  | 'NOT_STARTED'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ELIGIBLE'
  | 'INELIGIBLE'
  | 'FAILED';

@Entity('bank_loan_customer_profiles')
@Check(
  'bank_loan_customer_profiles_membership_check',
  `"membershipStatus" IN ('UNDECLARED','BANK_CUSTOMER','ACCOUNT_OPENING_REQUESTED','ACCOUNT_OPENED')`,
)
@Check(
  'bank_loan_customer_profiles_opening_check',
  `"accountOpeningStatus" IN ('NOT_STARTED','SUBMITTED','UNDER_REVIEW','COMPLETED','REJECTED','FAILED')`,
)
@Check(
  'bank_loan_customer_profiles_eligibility_check',
  `"eligibilityStatus" IN ('NOT_STARTED','SUBMITTED','UNDER_REVIEW','ELIGIBLE','INELIGIBLE','FAILED')`,
)
@Check(
  'bank_loan_customer_profiles_eligible_amount_check',
  `"eligibleAmountIrr" IS NULL OR "eligibleAmountIrr" > 0`,
)
export class BankLoanCustomerProfile {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'bank_loan_customer_profiles_pkey',
  })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'bank_loan_customer_profiles_userId_fkey',
  })
  user!: User;

  @Column({ type: 'text', default: 'UNDECLARED' })
  membershipStatus!: BankMembershipStatus;

  /** AES-256-GCM encrypted bank customer number. */
  @Column({ type: 'text', nullable: true })
  customerNumberEnc!: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  customerNumberLast4!: string | null;

  @Column({ type: 'text', default: 'NOT_STARTED' })
  accountOpeningStatus!: BankAccountOpeningStatus;

  @Column({ type: 'text', nullable: true, unique: true })
  accountOpeningReferenceId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  accountOpeningSummary!: JsonValue | null;

  @Column({ type: 'text', default: 'NOT_STARTED' })
  eligibilityStatus!: BankEligibilityStatus;

  @Column({ type: 'text', nullable: true, unique: true })
  eligibilityReferenceId!: string | null;

  @Column({ type: 'bigint', transformer: bigintTransformer, nullable: true })
  eligibleAmountIrr!: bigint | null;

  @Column({ type: 'jsonb', nullable: true })
  eligibilitySummary!: JsonValue | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  lastSyncedAt!: Date | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
