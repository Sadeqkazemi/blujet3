import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { bigintTransformer } from '../transformers/bigint.transformer';

/**
 * Atomic claim ledger for bank disbursement credit references.
 * INSERT ON CONFLICT (creditReference) DO NOTHING ensures one wallet credit
 * per bank reference across concurrent loans/webhooks — no 23505 aborts.
 */
@Index('bank_loan_wallet_credits_loanApplicationId_idx', ['loanApplicationId'])
@Entity('bank_loan_wallet_credits')
export class BankLoanWalletCredit {
  @PrimaryColumn({
    type: 'text',
    primaryKeyConstraintName: 'bank_loan_wallet_credits_pkey',
  })
  creditReference!: string;

  @Column({ type: 'text' })
  loanApplicationId!: string;

  @Column({ type: 'text' })
  userId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amountIrr!: bigint;

  @Column({ type: 'text', nullable: true })
  walletEntryId!: string | null;

  @CreateDateColumn({ precision: 3, default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
