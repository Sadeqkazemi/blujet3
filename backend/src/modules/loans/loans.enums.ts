/**
 * Stub enums for the deferred loans domain.
 * No controllers / migrations until the loan phase starts.
 */

export const LoanApplicationStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type LoanApplicationStatus =
  (typeof LoanApplicationStatus)[keyof typeof LoanApplicationStatus];
