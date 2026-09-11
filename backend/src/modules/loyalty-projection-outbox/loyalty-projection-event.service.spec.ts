import { ConflictException } from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';
import type { LoyaltyProjectionEvent } from '../../common/events/loyalty-events';
import type { ClubCardRequest } from '../../database/entities/club-card-request.entity';
import type { ClubMember } from '../../database/entities/club-member.entity';
import type { ClubPointsEntry } from '../../database/entities/club-points-entry.entity';
import type { ClubTierRule } from '../../database/entities/club-tier-rule.entity';
import type { CustomerReferral } from '../../database/entities/customer-referral.entity';
import { LoyaltyProjectionAudit } from '../../database/entities/loyalty-projection-audit.entity';
import type { PriceLock } from '../../database/entities/price-lock.entity';
import {
  CabinClass,
  ClubCardRequestStatus,
  ClubCardStatus,
  ClubPointsEntryType,
  ClubTier,
  CustomerReferralStatus,
  PriceLockStatus,
} from '../../database/enums';
import { LoyaltyProjectionEventService } from './loyalty-projection-event.service';

const at = new Date('2030-01-01T00:00:00.000Z');

const member = {
  id: 'member-1',
  version: 2,
  userId: 'user-1',
  fullName: 'عضو تست',
  email: 'member@example.test',
  birthDate: null,
  nationalIdEnc: 'encrypted-national-id',
  nationalIdHash: 'hashed-national-id',
  joinDate: at,
  points: 1250,
  level: ClubTier.SILVER,
  cardStatus: ClubCardStatus.NONE,
  cardNo: null,
  issuedByLabelFa: null,
  createdAt: at,
  deactivatedAt: null,
  deactivatedById: null,
} as ClubMember;

const pointsEntry = {
  id: 'points-1',
  version: 1,
  clubMemberId: member.id,
  type: ClubPointsEntryType.EARN,
  signedPoints: 250,
  bookingId: 'booking-1',
  createdAt: at,
} as ClubPointsEntry;

const cardRequest = {
  id: 'card-request-1',
  version: 3,
  memberId: member.id,
  level: ClubTier.GOLD,
  points: 6000,
  status: ClubCardRequestStatus.APPROVED,
  assignedTo: null,
  decidedById: 'admin-1',
  decidedAt: at,
  cardNo: 'CARD-1',
  history: [],
  createdAt: at,
} as ClubCardRequest;

const tierRule = {
  id: 'tier-rule-1',
  version: 4,
  goldMinPoints: 5000,
  platinumMinPoints: 15000,
  cardRequestMinPoints: 5000,
  updatedById: 'admin-1',
  updatedAt: at,
  createdAt: at,
} as ClubTierRule;

const priceLock = {
  id: 'price-lock-1',
  version: 2,
  userId: 'user-1',
  flightInstanceId: 'flight-1',
  cabin: CabinClass.ECONOMY,
  lockedPriceIrr: 12_500_000n,
  feeIrr: 250_000n,
  feeCharged: true,
  status: PriceLockStatus.ACTIVE,
  expiresAt: at,
  createdAt: at,
  bookingId: null,
} as PriceLock;

const referral = {
  id: 'referral-1',
  version: 2,
  referrerUserId: 'user-1',
  referredUserId: 'user-2',
  status: CustomerReferralStatus.REWARDED,
  pointsAwarded: 500,
  firstBookingId: 'booking-1',
  rewardedAt: at,
  createdAt: at,
  updatedAt: at,
} as CustomerReferral;

function setup(existing: LoyaltyProjectionAudit | null = null) {
  const findOneBy = jest
    .fn<Promise<LoyaltyProjectionAudit | null>, [object]>()
    .mockResolvedValue(existing);
  const insert = jest.fn<Promise<object>, [object]>().mockResolvedValue({});
  const audits = {
    findOneBy,
    insert,
  } as unknown as Repository<LoyaltyProjectionAudit>;
  const manager = {
    queryRunner: { isTransactionActive: true },
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn().mockReturnValue(audits),
  } as unknown as EntityManager;
  const enqueueLoyalty = jest
    .fn<Promise<{ eventId: string }>, [EntityManager, LoyaltyProjectionEvent]>()
    .mockResolvedValue({ eventId: 'event-1' });
  const service = new LoyaltyProjectionEventService({
    enqueueLoyalty,
  } as never);
  return { service, manager, findOneBy, insert, enqueueLoyalty };
}

describe('LoyaltyProjectionEventService', () => {
  it('records exact versioned snapshots for every Loyalty aggregate', async () => {
    const { service, manager, insert, enqueueLoyalty } = setup();

    await service.recordMember(manager, member, 'UPDATED');
    await service.recordPointsEntry(manager, pointsEntry, 'POINTS_CHANGED');
    await service.recordCardRequest(manager, cardRequest, 'DECIDED');
    await service.recordTierRule(manager, tierRule, 'UPDATED');
    await service.recordPriceLock(manager, priceLock, 'CREATED');
    await service.recordReferral(manager, referral, 'REWARDED');

    expect(insert).toHaveBeenCalledTimes(6);
    expect(enqueueLoyalty.mock.calls.map((call) => call[1].eventType)).toEqual([
      'LoyaltyMemberProjected',
      'LoyaltyPointsEntryProjected',
      'LoyaltyCardRequestProjected',
      'LoyaltyTierRuleProjected',
      'LoyaltyPriceLockProjected',
      'LoyaltyReferralProjected',
    ]);
    const memberEvent = enqueueLoyalty.mock.calls[0][1];
    expect(memberEvent).toMatchObject({
      producer: 'core-loyalty',
      aggregateType: 'LoyaltyMember',
      aggregateId: 'member-1',
      idempotencyKey: 'loyalty-projected:LoyaltyMember:member-1:v2',
      payload: { recordVersion: 2 },
    });
    const priceLockEvent = enqueueLoyalty.mock.calls[4][1];
    expect(priceLockEvent.payload).toMatchObject({
      lockedPriceIrr: '12500000',
      feeIrr: '250000',
    });
  });

  it('reuses durable audit evidence for an idempotent replay', async () => {
    const existing = {
      id: 'audit-1',
      aggregateType: 'LoyaltyMember',
      aggregateId: member.id,
      recordVersion: member.version,
      mutation: 'UPDATED',
    } as LoyaltyProjectionAudit;
    const { service, manager, insert, enqueueLoyalty } = setup(existing);

    const result = await service.recordMember(manager, member, 'UPDATED');

    expect(result.auditId).toBe('audit-1');
    expect(insert).not.toHaveBeenCalled();
    expect(enqueueLoyalty.mock.calls[0][1].payload.auditId).toBe('audit-1');
  });

  it('rejects a different mutation reusing the same aggregate version', async () => {
    const existing = {
      id: 'audit-1',
      aggregateType: 'LoyaltyMember',
      aggregateId: member.id,
      recordVersion: member.version,
      mutation: 'UPDATED',
    } as LoyaltyProjectionAudit;
    const { service, manager, enqueueLoyalty } = setup(existing);

    await expect(
      service.recordMember(manager, member, 'DEACTIVATED'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(enqueueLoyalty).not.toHaveBeenCalled();
  });

  it('propagates an outbox fingerprint conflict on changed replay content', async () => {
    const existing = {
      id: 'audit-1',
      aggregateType: 'LoyaltyMember',
      aggregateId: member.id,
      recordVersion: member.version,
      mutation: 'UPDATED',
    } as LoyaltyProjectionAudit;
    const { service, manager, enqueueLoyalty } = setup(existing);
    enqueueLoyalty.mockRejectedValueOnce(new ConflictException());

    await expect(
      service.recordMember(
        manager,
        { ...member, points: member.points + 1 } as ClubMember,
        'UPDATED',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires the caller transaction', async () => {
    const { service, manager } = setup();
    Object.assign(manager, { queryRunner: undefined });

    await expect(
      service.recordMember(manager, member, 'CREATED'),
    ).rejects.toThrow('active Core transaction');
  });
});
