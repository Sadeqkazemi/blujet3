import { ClubCardRequest } from './entities/club-card-request.entity';
import { ClubMember } from './entities/club-member.entity';
import { ClubPointsEntry } from './entities/club-points-entry.entity';
import { ClubTierRule } from './entities/club-tier-rule.entity';
import { CustomerReferral } from './entities/customer-referral.entity';
import { PriceLock } from './entities/price-lock.entity';

export const loyaltyEntities = [
  ClubMember,
  ClubPointsEntry,
  ClubCardRequest,
  ClubTierRule,
  PriceLock,
  CustomerReferral,
];
