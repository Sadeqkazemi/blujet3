export const CabinClass = {
  ECONOMY: 'ECONOMY',
  BUSINESS: 'BUSINESS',
  COMFORT: 'COMFORT',
  FIRST: 'FIRST',
} as const;
export type CabinClass = (typeof CabinClass)[keyof typeof CabinClass];

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
