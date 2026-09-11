import { BadRequestException } from '@nestjs/common';
import type { CanonicalEvent } from './canonical-events';
import {
  createLoyaltyCardRequestProjected,
  createLoyaltyMemberProjected,
  createLoyaltyPointsEntryProjected,
  createLoyaltyPriceLockProjected,
  createLoyaltyReferralProjected,
  createLoyaltyTierRuleProjected,
  parseLoyaltyProjectionEvent,
  type LoyaltyProjectionEvent,
  type LoyaltyProjectionEventContext,
} from './loyalty-events';

describe('Loyalty projection events', () => {
  const createdAt = new Date('2026-09-11T08:00:00.000Z');
  const context = (recordVersion = 1): LoyaltyProjectionEventContext => ({
    auditId: `audit-${recordVersion}`,
    correlationId: 'request-1',
    idempotencyKey: `record-v${recordVersion}`,
    occurredAt: new Date('2026-09-11T09:00:00.000Z'),
    recordVersion,
  });

  const member = () =>
    createLoyaltyMemberProjected(
      {
        id: 'member-1',
        userId: 'user-1',
        fullName: 'عضو نمونه',
        email: 'member@example.test',
        birthDate: new Date('1990-01-01T00:00:00.000Z'),
        nationalIdEnc: 'ciphertext',
        nationalIdHash: 'lookup-hash',
        joinDate: createdAt,
        points: 500,
        level: 'SILVER',
        cardStatus: 'NONE',
        cardNo: null,
        issuedByLabelFa: null,
        createdAt,
        deactivatedAt: null,
        deactivatedById: null,
      },
      context(2),
    );

  const points = () =>
    createLoyaltyPointsEntryProjected(
      {
        id: 'points-1',
        clubMemberId: 'member-1',
        type: 'EARN',
        signedPoints: 500,
        bookingId: 'booking-1',
        createdAt,
      },
      context(),
    );

  const cardRequest = () =>
    createLoyaltyCardRequestProjected(
      {
        id: 'card-request-1',
        memberId: 'member-1',
        level: 'GOLD',
        points: 5000,
        status: 'SUBMITTED',
        assignedTo: null,
        decidedById: null,
        decidedAt: null,
        cardNo: null,
        history: [{ status: 'SUBMITTED' }],
        createdAt,
      },
      context(),
    );

  const tierRule = () =>
    createLoyaltyTierRuleProjected(
      {
        id: 'tier-rule-1',
        goldMinPoints: 5000,
        platinumMinPoints: 15000,
        cardRequestMinPoints: 5000,
        updatedById: 'staff-1',
        updatedAt: new Date('2026-09-11T08:30:00.000Z'),
        createdAt,
      },
      context(3),
    );

  const priceLock = () =>
    createLoyaltyPriceLockProjected(
      {
        id: 'price-lock-1',
        userId: 'user-1',
        flightInstanceId: 'flight-instance-1',
        cabin: 'ECONOMY',
        lockedPriceIrr: 9_007_199_254_740_993n,
        feeIrr: 270_215_977_642_229n,
        feeCharged: true,
        status: 'ACTIVE',
        expiresAt: new Date('2026-09-14T08:00:00.000Z'),
        createdAt,
        bookingId: null,
      },
      context(),
    );

  const referral = () =>
    createLoyaltyReferralProjected(
      {
        id: 'referral-1',
        referrerUserId: 'user-1',
        referredUserId: 'user-2',
        status: 'REWARDED',
        pointsAwarded: 500,
        firstBookingId: 'booking-1',
        rewardedAt: new Date('2026-09-11T08:45:00.000Z'),
        createdAt,
        updatedAt: new Date('2026-09-11T08:45:00.000Z'),
      },
      context(2),
    );

  const all = (): LoyaltyProjectionEvent[] => [
    member(),
    points(),
    cardRequest(),
    tierRule(),
    priceLock(),
    referral(),
  ];

  it('builds six exact, detached v1 full snapshots', () => {
    const events = all();
    expect(events.map((event) => event.eventType)).toEqual([
      'LoyaltyMemberProjected',
      'LoyaltyPointsEntryProjected',
      'LoyaltyCardRequestProjected',
      'LoyaltyTierRuleProjected',
      'LoyaltyPriceLockProjected',
      'LoyaltyReferralProjected',
    ]);
    expect(events.every((event) => event.producer === 'core-loyalty')).toBe(
      true,
    );
    expect(events.every((event) => event.eventVersion === 1)).toBe(true);
    expect(
      events.every(
        (event) => event.occurredAt === context().occurredAt.toISOString(),
      ),
    ).toBe(true);
  });

  it('preserves bigint IRR as lossless decimal strings', () => {
    expect(priceLock().payload).toMatchObject({
      lockedPriceIrr: '9007199254740993',
      feeIrr: '270215977642229',
    });
  });

  it('detaches nested caller-owned card history', () => {
    const source = {
      id: 'card-request-2',
      memberId: 'member-1',
      level: 'GOLD' as const,
      points: 5000,
      status: 'SUBMITTED' as const,
      assignedTo: null,
      decidedById: null,
      decidedAt: null,
      cardNo: null,
      history: [{ status: 'SUBMITTED' }],
      createdAt,
    };
    const event = createLoyaltyCardRequestProjected(source, context());
    source.history[0] = { status: 'CHANGED' };
    expect(event.payload.history).toEqual([{ status: 'SUBMITTED' }]);
  });

  it.each([
    { auditId: '' },
    { recordVersion: 0 },
    { recordVersion: 1.5 },
    { recordVersion: 2_147_483_648 },
    { unexpected: true },
  ])('rejects invalid common payload fields (%#)', (change) => {
    const event = member();
    expect(() =>
      parseLoyaltyProjectionEvent({
        ...event,
        payload: { ...event.payload, ...change },
      }),
    ).toThrow(BadRequestException);
  });

  it.each([
    { producer: 'other' },
    { aggregateType: 'LoyaltyReferral' },
    { eventVersion: 2 },
    { eventId: 'bad' },
    { correlationId: 'contains space' },
    { occurredAt: '2026-09-11' },
  ])('rejects incompatible envelopes (%#)', (change) => {
    expect(() =>
      parseLoyaltyProjectionEvent({ ...member(), ...change }),
    ).toThrow(BadRequestException);
  });

  it.each([
    ['member enum', member, { level: 'DIAMOND' }],
    ['member timestamp', member, { birthDate: '1990-01-01' }],
    ['points zero', points, { signedPoints: 0 }],
    ['points mutation version', points, { recordVersion: 2 }],
    ['card status', cardRequest, { status: 'DONE' }],
    ['tier order', tierRule, { goldMinPoints: 20000 }],
    ['price float', priceLock, { feeIrr: '1.5' }],
    ['price overflow', priceLock, { lockedPriceIrr: '9223372036854775808' }],
    ['referral self-reference', referral, { referredUserId: 'user-1' }],
    ['referral timestamp', referral, { updatedAt: 'invalid' }],
  ] as const)(
    'rejects invalid aggregate payload: %s',
    (_name, factory, change) => {
      const event = factory();
      expect(() =>
        parseLoyaltyProjectionEvent({
          ...event,
          payload: { ...event.payload, ...change },
        }),
      ).toThrow(BadRequestException);
    },
  );

  it.each(all())('parses valid $eventType snapshots', (event) => {
    expect(parseLoyaltyProjectionEvent(event)).toEqual(event);
  });

  it('rejects an event type outside the Loyalty contract', () => {
    const event: CanonicalEvent = {
      ...member(),
      eventType: 'CartableTaskProjected',
    };
    expect(() => parseLoyaltyProjectionEvent(event)).toThrow(
      BadRequestException,
    );
  });
});
