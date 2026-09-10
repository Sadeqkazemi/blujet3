export const Role = {
  USER: 'USER',
  AGENCY: 'AGENCY',
  EMPLOYEE: 'EMPLOYEE',
  IT_MANAGER: 'IT_MANAGER',
  COMMERCIAL_MANAGER: 'COMMERCIAL_MANAGER',
  FINANCE_MANAGER: 'FINANCE_MANAGER',
  OPERATIONS_MANAGER: 'OPERATIONS_MANAGER',
  SENIOR_MANAGER: 'SENIOR_MANAGER',
  CEO: 'CEO',
  BOARD_CHAIR: 'BOARD_CHAIR',
  SITE_ADMIN: 'SITE_ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Locale = {
  FA: 'FA',
  EN: 'EN',
  AR: 'AR',
} as const;
export type Locale = (typeof Locale)[keyof typeof Locale];

export const TwoFactorPurpose = {
  STAFF_LOGIN_2FA: 'STAFF_LOGIN_2FA',
  AGENCY_LOGIN_2FA: 'AGENCY_LOGIN_2FA',
  CUSTOMER_OTP_LOGIN: 'CUSTOMER_OTP_LOGIN',
  STEP_UP_VERIFICATION: 'STEP_UP_VERIFICATION',
  EMAIL_VERIFY: 'EMAIL_VERIFY',
  PASSWORD_RESET_EMAIL: 'PASSWORD_RESET_EMAIL',
  AGENCY_PASSWORD_RESET: 'AGENCY_PASSWORD_RESET',
} as const;
export type TwoFactorPurpose =
  (typeof TwoFactorPurpose)[keyof typeof TwoFactorPurpose];

export const StepUpScope = {
  ADMIN_ROLE_CHANGE: 'ADMIN_ROLE_CHANGE',
  API_KEY_ROTATE: 'API_KEY_ROTATE',
  REFUND_PAYOUT: 'REFUND_PAYOUT',
  PRICE_CAPACITY_CHANGE: 'PRICE_CAPACITY_CHANGE',
  SESSION_REVOKE: 'SESSION_REVOKE',
} as const;
export type StepUpScope = (typeof StepUpScope)[keyof typeof StepUpScope];

export const EmployeeReferralScope = {
  MANAGERS_ONLY: 'MANAGERS_ONLY',
  ALL_STAFF: 'ALL_STAFF',
} as const;
export type EmployeeReferralScope =
  (typeof EmployeeReferralScope)[keyof typeof EmployeeReferralScope];

export const CustomerIdentityStatus = {
  NOT_STARTED: 'NOT_STARTED',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type CustomerIdentityStatus =
  (typeof CustomerIdentityStatus)[keyof typeof CustomerIdentityStatus];
