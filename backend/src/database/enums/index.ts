/**
 * Every enum used across the TypeORM entity set. Source of truth for enum
 * values — keep in sync with the columns declared in
 * `src/database/entities/*.entity.ts` and the baseline migration.
 */

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

export const AuditCategory = {
  AGENCY: 'AGENCY',
  PRICING: 'PRICING',
  FINANCE: 'FINANCE',
  REFUND: 'REFUND',
  STRATEGY: 'STRATEGY',
  SYSTEM: 'SYSTEM',
  CLUB: 'CLUB',
  ACCOUNT: 'ACCOUNT',
  ACCESS: 'ACCESS',
  SECURITY: 'SECURITY',
  RESERVATION: 'RESERVATION',
  SURVEY: 'SURVEY',
  CONTENT: 'CONTENT',
} as const;
export type AuditCategory = (typeof AuditCategory)[keyof typeof AuditCategory];

export const FlightInstanceStatus = {
  SCHEDULED: 'SCHEDULED',
  DEPARTED: 'DEPARTED',
  CANCELLED: 'CANCELLED',
} as const;
export type FlightInstanceStatus =
  (typeof FlightInstanceStatus)[keyof typeof FlightInstanceStatus];

export const CabinClass = {
  ECONOMY: 'ECONOMY',
  COMFORT: 'COMFORT',
  BUSINESS: 'BUSINESS',
  FIRST: 'FIRST',
} as const;
export type CabinClass = (typeof CabinClass)[keyof typeof CabinClass];

export const AircraftStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type AircraftStatus =
  (typeof AircraftStatus)[keyof typeof AircraftStatus];

export const AircraftSeatSide = {
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
} as const;
export type AircraftSeatSide =
  (typeof AircraftSeatSide)[keyof typeof AircraftSeatSide];

/**
 * Flight definition / revision workflow.
 * Sellable: PUBLISHED, or PENDING_REVISION with approvedSnapshot.
 * Legacy DB value APPROVED is data-migrated to PUBLISHED.
 */
export const FlightDefinitionStatus = {
  DRAFT: 'DRAFT',
  PENDING_OPERATIONS: 'PENDING_OPERATIONS',
  OPERATIONS_REJECTED: 'OPERATIONS_REJECTED',
  PENDING_CEO: 'PENDING_CEO',
  REJECTED: 'REJECTED',
  PENDING_REVISION: 'PENDING_REVISION',
  PUBLISHED: 'PUBLISHED',
  /** @deprecated migrated to PUBLISHED — kept for TypeORM/Postgres enum parity during transition */
  APPROVED: 'APPROVED',
} as const;
export type FlightDefinitionStatus =
  (typeof FlightDefinitionStatus)[keyof typeof FlightDefinitionStatus];

export const FlightReviewStage = {
  OPERATIONS: 'OPERATIONS',
  CEO: 'CEO',
} as const;
export type FlightReviewStage =
  (typeof FlightReviewStage)[keyof typeof FlightReviewStage];

export const FlightReviewDecision = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type FlightReviewDecision =
  (typeof FlightReviewDecision)[keyof typeof FlightReviewDecision];

/** Seasonal schedule template lifecycle (commercial planning). */
export const FlightScheduleTemplateStatus = {
  ACTIVE: 'ACTIVE',
  DEACTIVATED: 'DEACTIVATED',
} as const;
export type FlightScheduleTemplateStatus =
  (typeof FlightScheduleTemplateStatus)[keyof typeof FlightScheduleTemplateStatus];

/**
 * Opaque bank-side loan application statuses (mirrored, never invented).
 * Display mapping lives in the loans module — do not treat these as
 * underwriting decisions made by blujet.
 */
export const BankLoanStatus = {
  /** Local reservation before/during bank create — never a bank-reported status. */
  INITIATING: 'INITIATING',
  SUBMITTED: 'SUBMITTED',
  PENDING: 'PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DISBURSED: 'DISBURSED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
} as const;
export type BankLoanStatus =
  (typeof BankLoanStatus)[keyof typeof BankLoanStatus];

export const ChargeCalculationMode = {
  FIXED: 'FIXED',
  PERCENTAGE: 'PERCENTAGE',
} as const;
export type ChargeCalculationMode =
  (typeof ChargeCalculationMode)[keyof typeof ChargeCalculationMode];

export const ChargeKind = {
  TAX: 'TAX',
  FEE: 'FEE',
} as const;
export type ChargeKind = (typeof ChargeKind)[keyof typeof ChargeKind];

export const BookingChannel = {
  SYSTEM: 'SYSTEM',
  CHARTER: 'CHARTER',
  AGENCY: 'AGENCY',
} as const;
export type BookingChannel =
  (typeof BookingChannel)[keyof typeof BookingChannel];

export const BookingStatus = {
  DRAFT: 'DRAFT',
  HELD: 'HELD',
  PAID: 'PAID',
  TICKETED: 'TICKETED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  REFUNDED: 'REFUNDED',
  FLOWN: 'FLOWN',
  NO_SHOW: 'NO_SHOW',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const PaymentReconciliationStatus = {
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
} as const;
export type PaymentReconciliationStatus =
  (typeof PaymentReconciliationStatus)[keyof typeof PaymentReconciliationStatus];

export const LedgerEntryType = {
  SALE: 'SALE',
  REFUND: 'REFUND',
  SETTLEMENT: 'SETTLEMENT',
  COMMISSION: 'COMMISSION',
  COMMITMENT: 'COMMITMENT',
} as const;
export type LedgerEntryType =
  (typeof LedgerEntryType)[keyof typeof LedgerEntryType];

export const CommitmentStatus = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
} as const;
export type CommitmentStatus =
  (typeof CommitmentStatus)[keyof typeof CommitmentStatus];

export const AgencyTier = {
  NORMAL: 'NORMAL',
  SILVER: 'SILVER',
  GOLD: 'GOLD',
} as const;
export type AgencyTier = (typeof AgencyTier)[keyof typeof AgencyTier];

export const AllotmentType = {
  SOFT: 'SOFT',
  HARD: 'HARD',
} as const;
export type AllotmentType = (typeof AllotmentType)[keyof typeof AllotmentType];

export const AgencyMembershipStatus = {
  PENDING: 'PENDING',
  REFERRED: 'REFERRED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type AgencyMembershipStatus =
  (typeof AgencyMembershipStatus)[keyof typeof AgencyMembershipStatus];

export const AgencyApiScope = {
  FULL: 'FULL',
  SEARCH_BOOK: 'SEARCH_BOOK',
  SEARCH_ONLY: 'SEARCH_ONLY',
} as const;
export type AgencyApiScope =
  (typeof AgencyApiScope)[keyof typeof AgencyApiScope];

/** Fine-grained partner-API capabilities managed from IT webservices. */
export const AgencyApiCapability = {
  RESERVATION: 'RESERVATION',
  TICKETING: 'TICKETING',
  PRICING: 'PRICING',
  FLIGHT_INFO: 'FLIGHT_INFO',
  REFUND: 'REFUND',
  CHECK_IN: 'CHECK_IN',
  AVAILABILITY: 'AVAILABILITY',
} as const;
export type AgencyApiCapability =
  (typeof AgencyApiCapability)[keyof typeof AgencyApiCapability];

export const AgencyApiEnvironment = {
  SANDBOX: 'SANDBOX',
  PRODUCTION: 'PRODUCTION',
} as const;
export type AgencyApiEnvironment =
  (typeof AgencyApiEnvironment)[keyof typeof AgencyApiEnvironment];

export const AgencyFlightDomain = {
  ALL: 'ALL',
  DOMESTIC: 'DOMESTIC',
  INTERNATIONAL: 'INTERNATIONAL',
} as const;
export type AgencyFlightDomain =
  (typeof AgencyFlightDomain)[keyof typeof AgencyFlightDomain];

export const AgencyApiKeyStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REVOKED: 'REVOKED',
} as const;
export type AgencyApiKeyStatus =
  (typeof AgencyApiKeyStatus)[keyof typeof AgencyApiKeyStatus];

export const AgencyInvoiceStatus = {
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOIDED: 'VOIDED',
} as const;
export type AgencyInvoiceStatus =
  (typeof AgencyInvoiceStatus)[keyof typeof AgencyInvoiceStatus];

/** Manager aggregate invoice tabs. OVERDUE is never mapped to VOIDED;
 * it serializes as UNPAID (issued / still payable). */
export const AggregateInvoiceStatus = {
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  VOIDED: 'VOIDED',
} as const;
export type AggregateInvoiceStatus =
  (typeof AggregateInvoiceStatus)[keyof typeof AggregateInvoiceStatus];

export const AgencySeatRequestStatus = {
  PENDING: 'PENDING',
  PENDING_FINANCE: 'PENDING_FINANCE',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type AgencySeatRequestStatus =
  (typeof AgencySeatRequestStatus)[keyof typeof AgencySeatRequestStatus];

export const AgencySeatRequestPayMethod = {
  CREDIT: 'CREDIT',
  INVOICE: 'INVOICE',
} as const;
export type AgencySeatRequestPayMethod =
  (typeof AgencySeatRequestPayMethod)[keyof typeof AgencySeatRequestPayMethod];

/** `0` represents one week; other values are terms in months. */
export const AGENCY_SEAT_REQUEST_TERM_MONTHS = [0, 1, 3, 6, 12] as const;
export type AgencySeatRequestTermMonths =
  (typeof AGENCY_SEAT_REQUEST_TERM_MONTHS)[number];

export const AncillaryServiceCategory = {
  SEAT: 'SEAT',
  OTHER: 'OTHER',
} as const;
export type AncillaryServiceCategory =
  (typeof AncillaryServiceCategory)[keyof typeof AncillaryServiceCategory];

export const AgencyCreditRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type AgencyCreditRequestStatus =
  (typeof AgencyCreditRequestStatus)[keyof typeof AgencyCreditRequestStatus];

export const AgencyWebserviceRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type AgencyWebserviceRequestStatus =
  (typeof AgencyWebserviceRequestStatus)[keyof typeof AgencyWebserviceRequestStatus];

export const AgencyDocumentType = {
  LICENSE: 'LICENSE',
  CONTRACT: 'CONTRACT',
  OTHER: 'OTHER',
} as const;
export type AgencyDocumentType =
  (typeof AgencyDocumentType)[keyof typeof AgencyDocumentType];

export const AgencyDocumentStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type AgencyDocumentStatus =
  (typeof AgencyDocumentStatus)[keyof typeof AgencyDocumentStatus];

export const CartableCategory = {
  ADMIN: 'ADMIN',
  AGENCY: 'AGENCY',
  MANAGER: 'MANAGER',
} as const;
export type CartableCategory =
  (typeof CartableCategory)[keyof typeof CartableCategory];

export const CartableSourceType = {
  MANAGER_MESSAGE: 'MANAGER_MESSAGE',
  MANAGER_REFERRAL: 'MANAGER_REFERRAL',
  AGENCY_REQUEST: 'AGENCY_REQUEST',
  CHAIR_PERMISSION: 'CHAIR_PERMISSION',
  EMPLOYEE_MESSAGE: 'EMPLOYEE_MESSAGE',
} as const;
export type CartableSourceType =
  (typeof CartableSourceType)[keyof typeof CartableSourceType];

export const CartableStatus = {
  OPEN: 'OPEN',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  TRANSFERRED: 'TRANSFERRED',
} as const;
export type CartableStatus =
  (typeof CartableStatus)[keyof typeof CartableStatus];

export const ReferralPriority = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;
export type ReferralPriority =
  (typeof ReferralPriority)[keyof typeof ReferralPriority];

export const ReferralStatus = {
  SENT: 'SENT',
  REVIEWING: 'REVIEWING',
  REPORTED: 'REPORTED',
  CLOSED: 'CLOSED',
} as const;
export type ReferralStatus =
  (typeof ReferralStatus)[keyof typeof ReferralStatus];

export const ManagerMessageDept = {
  FINANCE: 'FINANCE',
  COMMERCIAL: 'COMMERCIAL',
  SUPPORT: 'SUPPORT',
  AGENCIES: 'AGENCIES',
  CEO: 'CEO',
  ALL_MANAGERS: 'ALL_MANAGERS',
} as const;
export type ManagerMessageDept =
  (typeof ManagerMessageDept)[keyof typeof ManagerMessageDept];

export const ChairPermissionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ChairPermissionStatus =
  (typeof ChairPermissionStatus)[keyof typeof ChairPermissionStatus];

export const ClubTier = {
  SILVER: 'SILVER',
  GOLD: 'GOLD',
  PLATINUM: 'PLATINUM',
} as const;
export type ClubTier = (typeof ClubTier)[keyof typeof ClubTier];

export const ClubCardStatus = {
  NONE: 'NONE',
  REVIEW: 'REVIEW',
  ISSUED: 'ISSUED',
} as const;
export type ClubCardStatus =
  (typeof ClubCardStatus)[keyof typeof ClubCardStatus];

export const ClubCardRequestStatus = {
  SUBMITTED: 'SUBMITTED',
  REFERRED: 'REFERRED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ClubCardRequestStatus =
  (typeof ClubCardRequestStatus)[keyof typeof ClubCardRequestStatus];

export const ClubCardAssignee = {
  SENIOR: 'SENIOR',
  CHAIR: 'CHAIR',
} as const;
export type ClubCardAssignee =
  (typeof ClubCardAssignee)[keyof typeof ClubCardAssignee];

export const PricingProposalStatus = {
  PENDING: 'PENDING',
  REGISTERED: 'REGISTERED',
  REJECTED: 'REJECTED',
} as const;
export type PricingProposalStatus =
  (typeof PricingProposalStatus)[keyof typeof PricingProposalStatus];

export const RefundStatus = {
  SUBMITTED: 'SUBMITTED',
  REVIEW: 'REVIEW',
  FINANCE: 'FINANCE',
  PAID: 'PAID',
} as const;
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];

export const EmployeeReferralScope = {
  MANAGERS_ONLY: 'MANAGERS_ONLY',
  ALL_STAFF: 'ALL_STAFF',
} as const;
export type EmployeeReferralScope =
  (typeof EmployeeReferralScope)[keyof typeof EmployeeReferralScope];

export const SmsMessageType = {
  OTP: 'OTP',
  TEMP_PASSWORD: 'TEMP_PASSWORD',
  SURVEY_INVITE: 'SURVEY_INVITE',
  FLIGHT_CANCELLED: 'FLIGHT_CANCELLED',
} as const;
export type SmsMessageType =
  (typeof SmsMessageType)[keyof typeof SmsMessageType];

export const SmsStatus = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;
export type SmsStatus = (typeof SmsStatus)[keyof typeof SmsStatus];

export const ExternalServiceMethod = {
  GET: 'GET',
  POST: 'POST',
} as const;
export type ExternalServiceMethod =
  (typeof ExternalServiceMethod)[keyof typeof ExternalServiceMethod];

export const BackupStatus = {
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;
export type BackupStatus = (typeof BackupStatus)[keyof typeof BackupStatus];

export const LockClassification = {
  FREE: 'FREE',
  DISCOUNTED: 'DISCOUNTED',
  PAYABLE: 'PAYABLE',
} as const;
export type LockClassification =
  (typeof LockClassification)[keyof typeof LockClassification];

export const LockApprovalStatus = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type LockApprovalStatus =
  (typeof LockApprovalStatus)[keyof typeof LockApprovalStatus];

export const PromoType = {
  PERCENT: 'PERCENT',
  FIXED: 'FIXED',
} as const;
export type PromoType = (typeof PromoType)[keyof typeof PromoType];

export const WalletEntryType = {
  TOPUP: 'TOPUP',
  PURCHASE: 'PURCHASE',
  REFUND: 'REFUND',
  ADJUST: 'ADJUST',
} as const;
export type WalletEntryType =
  (typeof WalletEntryType)[keyof typeof WalletEntryType];

export const ClubPointsEntryType = {
  EARN: 'EARN',
  REDEEM: 'REDEEM',
  ADJUST: 'ADJUST',
} as const;
export type ClubPointsEntryType =
  (typeof ClubPointsEntryType)[keyof typeof ClubPointsEntryType];

export const PriceLockStatus = {
  ACTIVE: 'ACTIVE',
  USED: 'USED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type PriceLockStatus =
  (typeof PriceLockStatus)[keyof typeof PriceLockStatus];

export const CustomerReferralStatus = {
  SIGNED_UP: 'SIGNED_UP',
  BOOKED: 'BOOKED',
  REWARDED: 'REWARDED',
} as const;
export type CustomerReferralStatus =
  (typeof CustomerReferralStatus)[keyof typeof CustomerReferralStatus];

export const CustomerIdentityStatus = {
  NOT_STARTED: 'NOT_STARTED',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type CustomerIdentityStatus =
  (typeof CustomerIdentityStatus)[keyof typeof CustomerIdentityStatus];

export const SupportTicketDept = {
  SITE: 'SITE',
  AGENCY: 'AGENCY',
} as const;
export type SupportTicketDept =
  (typeof SupportTicketDept)[keyof typeof SupportTicketDept];

export const SupportTicketPriority = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;
export type SupportTicketPriority =
  (typeof SupportTicketPriority)[keyof typeof SupportTicketPriority];

export const SupportTicketStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  ANSWERED: 'ANSWERED',
  CLOSED: 'CLOSED',
} as const;
export type SupportTicketStatus =
  (typeof SupportTicketStatus)[keyof typeof SupportTicketStatus];

export const JobType = {
  FULL_TIME: 'FULL_TIME',
  REMOTE: 'REMOTE',
  PART_TIME: 'PART_TIME',
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const JobApplicantGender = {
  FEMALE: 'FEMALE',
  MALE: 'MALE',
} as const;
export type JobApplicantGender =
  (typeof JobApplicantGender)[keyof typeof JobApplicantGender];

export const MaritalStatus = {
  SINGLE: 'SINGLE',
  MARRIED: 'MARRIED',
} as const;
export type MaritalStatus = (typeof MaritalStatus)[keyof typeof MaritalStatus];

export const MilitaryStatus = {
  CONSCRIPT: 'CONSCRIPT',
  EXEMPT: 'EXEMPT',
  WAIVED: 'WAIVED',
} as const;
export type MilitaryStatus =
  (typeof MilitaryStatus)[keyof typeof MilitaryStatus];

export const JobApplicationStatus = {
  SUBMITTED: 'SUBMITTED',
  REFERRED: 'REFERRED',
  HIRED: 'HIRED',
  REJECTED: 'REJECTED',
} as const;
export type JobApplicationStatus =
  (typeof JobApplicationStatus)[keyof typeof JobApplicationStatus];

export const BlogCategory = {
  NEWS: 'NEWS',
  GUIDE: 'GUIDE',
  DEST: 'DEST',
  OFFERS: 'OFFERS',
} as const;
export type BlogCategory = (typeof BlogCategory)[keyof typeof BlogCategory];

export const BlogPostStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  SCHEDULED: 'SCHEDULED',
} as const;
export type BlogPostStatus =
  (typeof BlogPostStatus)[keyof typeof BlogPostStatus];

export const SiteContentBlockKey = {
  HERO_BANNER: 'HERO_BANNER',
  ANNOUNCEMENT_BAR: 'ANNOUNCEMENT_BAR',
  PROMO_BANNER: 'PROMO_BANNER',
} as const;
export type SiteContentBlockKey =
  (typeof SiteContentBlockKey)[keyof typeof SiteContentBlockKey];

/** Which of the sidebar's separate unread badges a notification counts
 * against — GET /notifications/unread-count breaks its total down by
 * these exact keys. SYSTEM covers events with no more specific home
 * (e.g. ACCESS_REVOKED). */
export const NotificationCategory = {
  CARTABLE: 'CARTABLE',
  MESSAGE: 'MESSAGE',
  REQUEST: 'REQUEST',
  APPROVAL: 'APPROVAL',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationCategory =
  (typeof NotificationCategory)[keyof typeof NotificationCategory];
