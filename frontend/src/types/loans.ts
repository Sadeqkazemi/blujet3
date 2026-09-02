export type BankLoanStatus =
  | "INITIATING"
  | "SUBMITTED"
  | "PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "DISBURSED"
  | "CANCELLED"
  | "FAILED"
  | "UNKNOWN";

export type LoanDisplayStatus =
  | "processing"
  | "awaiting_bank"
  | "under_review"
  | "approved"
  | "rejected"
  | "disbursed"
  | "cancelled"
  | "failed"
  | "unknown";

export interface LoanApplication {
  id: string;
  requestedAmountIrr: string;
  bankStatus: BankLoanStatus;
  displayStatus: LoanDisplayStatus;
  bankReferenceId: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
  userId?: string;
  customer?: {
    id: string;
    fullName: string;
    phone: string | null;
  } | null;
  statusSummary?: Record<string, unknown> | null;
  walletCreditReference?: string | null;
}

export interface LoanApplicationList {
  items: LoanApplication[];
  page: number;
  pageSize: number;
  total: number;
}

export interface LoanCustomerProfile {
  membershipStatus:
    | "UNDECLARED"
    | "BANK_CUSTOMER"
    | "ACCOUNT_OPENING_REQUESTED"
    | "ACCOUNT_OPENED";
  maskedCustomerNumber: string | null;
  accountOpeningStatus:
    | "NOT_STARTED"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "COMPLETED"
    | "REJECTED"
    | "FAILED";
  accountOpeningReferenceId: string | null;
  eligibilityStatus:
    | "NOT_STARTED"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "ELIGIBLE"
    | "INELIGIBLE"
    | "FAILED";
  eligibilityReferenceId: string | null;
  eligibleAmountIrr: string | null;
  lastSyncedAt: string | null;
  updatedAt: string;
}
