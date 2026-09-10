export const AgencyTier = {
  NORMAL: 'NORMAL',
  SILVER: 'SILVER',
  GOLD: 'GOLD',
} as const;
export type AgencyTier = (typeof AgencyTier)[keyof typeof AgencyTier];

export const AgencyInvoiceStatus = {
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOIDED: 'VOIDED',
} as const;
export type AgencyInvoiceStatus =
  (typeof AgencyInvoiceStatus)[keyof typeof AgencyInvoiceStatus];

export const AgencyCreditRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type AgencyCreditRequestStatus =
  (typeof AgencyCreditRequestStatus)[keyof typeof AgencyCreditRequestStatus];
