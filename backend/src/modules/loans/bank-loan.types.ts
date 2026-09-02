import type { BankLoanStatus } from '../../database/enums';

/** Display statuses for customer / admin UI — never invent bank decisions. */
export type LoanDisplayStatus =
  | 'processing'
  | 'awaiting_bank'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'disbursed'
  | 'cancelled'
  | 'failed'
  | 'unknown';

export function mapBankStatusToDisplay(
  status: BankLoanStatus,
): LoanDisplayStatus {
  switch (status) {
    case 'INITIATING':
      return 'processing';
    case 'SUBMITTED':
    case 'PENDING':
      return 'awaiting_bank';
    case 'UNDER_REVIEW':
      return 'under_review';
    case 'APPROVED':
      return 'approved';
    case 'REJECTED':
      return 'rejected';
    case 'DISBURSED':
      return 'disbursed';
    case 'CANCELLED':
      return 'cancelled';
    case 'FAILED':
      return 'failed';
    default:
      return 'unknown';
  }
}

export function parseBankStatus(
  raw: string | undefined | null,
): BankLoanStatus {
  const v = (raw ?? '').toUpperCase();
  const allowed = new Set([
    'SUBMITTED',
    'PENDING',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'DISBURSED',
    'CANCELLED',
    'FAILED',
  ]);
  if (allowed.has(v)) return v as BankLoanStatus;
  return 'UNKNOWN';
}

export interface BankCreateLoanRequest {
  correlationId: string;
  idempotencyKey: string;
  requestedAmountIrr: string;
  customerExternalId: string;
  customerNumber: string;
}

export interface BankAccountOpeningResponse {
  referenceId: string;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'COMPLETED' | 'REJECTED' | 'FAILED';
  customerNumber?: string | null;
  summary?: Record<string, unknown>;
}

export interface BankEligibilityResponse {
  referenceId: string;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'ELIGIBLE' | 'INELIGIBLE' | 'FAILED';
  eligibleAmountIrr?: string | null;
  summary?: Record<string, unknown>;
}

export interface BankCreateLoanResponse {
  bankReferenceId: string;
  bankStatus: BankLoanStatus;
  /** When bank explicitly instructs wallet credit. */
  walletCreditIrr?: string | null;
  walletCreditReference?: string | null;
  summary?: Record<string, unknown>;
}

export interface BankLoanStatusResponse {
  bankReferenceId: string;
  bankStatus: BankLoanStatus;
  walletCreditIrr?: string | null;
  walletCreditReference?: string | null;
  summary?: Record<string, unknown>;
}

export interface BankLoanProvider {
  requestAccountOpening(req: {
    correlationId: string;
    idempotencyKey: string;
    customerExternalId: string;
  }): Promise<BankAccountOpeningResponse>;
  getAccountOpeningStatus(
    referenceId: string,
    correlationId: string,
  ): Promise<BankAccountOpeningResponse>;
  requestEligibility(req: {
    correlationId: string;
    idempotencyKey: string;
    customerExternalId: string;
    customerNumber: string;
  }): Promise<BankEligibilityResponse>;
  getEligibilityStatus(
    referenceId: string,
    correlationId: string,
  ): Promise<BankEligibilityResponse>;
  createApplication(
    req: BankCreateLoanRequest,
  ): Promise<BankCreateLoanResponse>;
  getStatus(
    bankReferenceId: string,
    correlationId: string,
  ): Promise<BankLoanStatusResponse>;
}
