import { ClubCardRequest } from './entities/club-card-request.entity';
import { ClubMember } from './entities/club-member.entity';
import { ClubPointsEntry } from './entities/club-points-entry.entity';
import { ClubTierRule } from './entities/club-tier-rule.entity';
import { CustomerReferral } from './entities/customer-referral.entity';
import { PriceLock } from './entities/price-lock.entity';
import { LoyaltyProjectionEventReceipt } from './entities/loyalty-projection-event-receipt.entity';
import { LoyaltyProjectionSlot } from './entities/loyalty-projection-slot.entity';

export const loyaltyEntities = [
  ClubMember,
  ClubPointsEntry,
  ClubCardRequest,
  ClubTierRule,
  PriceLock,
  CustomerReferral,
  LoyaltyProjectionEventReceipt,
  LoyaltyProjectionSlot,
];
