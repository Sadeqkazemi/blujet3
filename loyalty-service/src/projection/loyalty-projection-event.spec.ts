import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { parseLoyaltyProjectionEvent } from './loyalty-projection-event';

const at = '2026-09-12T10:00:00.000Z';

function envelope(
  eventType: string,
  aggregateType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    eventType,
    eventVersion: 1,
    occurredAt: at,
    producer: 'core-loyalty',
    aggregateType,
    aggregateId: randomUUID(),
    correlationId: randomUUID(),
    idempotencyKey: randomUUID(),
    payload: { auditId: randomUUID(), recordVersion: 1, ...payload },
  };
}

function validEvents(): Record<string, unknown>[] {
  const memberId = randomUUID();
  return [
    envelope('LoyaltyMemberProjected', 'LoyaltyMember', {
      userId: randomUUID(),
      fullName: 'Member',
      email: 'member@example.invalid',
      birthDate: null,
      nationalIdEnc: 'encrypted',
      nationalIdHash: 'hash',
      joinDate: at,
      points: 500,
      level: 'SILVER',
      cardStatus: 'NONE',
      cardNo: null,
      issuedByLabelFa: null,
      createdAt: at,
      deactivatedAt: null,
      deactivatedById: null,
    }),
    envelope('LoyaltyPointsEntryProjected', 'LoyaltyPointsEntry', {
      clubMemberId: memberId,
      type: 'EARN',
      signedPoints: 500,
      bookingId: randomUUID(),
      createdAt: at,
    }),
    envelope('LoyaltyCardRequestProjected', 'LoyaltyCardRequest', {
      memberId,
      level: 'SILVER',
      points: 500,
      status: 'SUBMITTED',
      assignedTo: null,
      decidedById: null,
      decidedAt: null,
      cardNo: null,
      history: [{ step: 'submitted', labelFa: 'ثبت', at }],
      createdAt: at,
    }),
    envelope('LoyaltyTierRuleProjected', 'LoyaltyTierRule', {
      goldMinPoints: 5000,
      platinumMinPoints: 15000,
      cardRequestMinPoints: 5000,
      updatedById: randomUUID(),
      updatedAt: at,
      createdAt: at,
    }),
    envelope('LoyaltyPriceLockProjected', 'LoyaltyPriceLock', {
      userId: randomUUID(),
      flightInstanceId: randomUUID(),
      cabin: 'ECONOMY',
      lockedPriceIrr: '9007199254740993',
      feeIrr: '300000',
      feeCharged: true,
      status: 'ACTIVE',
      expiresAt: '2026-09-13T10:00:00.000Z',
      createdAt: at,
      bookingId: null,
    }),
    envelope('LoyaltyReferralProjected', 'LoyaltyReferral', {
      referrerUserId: randomUUID(),
      referredUserId: randomUUID(),
      status: 'SIGNED_UP',
      pointsAwarded: 0,
      firstBookingId: null,
      rewardedAt: null,
      createdAt: at,
      updatedAt: at,
    }),
  ];
}

describe('parseLoyaltyProjectionEvent', () => {
  it('accepts exact v1 snapshots for all six Loyalty aggregates', () => {
    expect(
      validEvents().map((event) => parseLoyaltyProjectionEvent(event)),
    ).toHaveLength(6);
  });

  it.each([
    [
      'extra envelope field',
      (event: Record<string, unknown>) => (event.extra = true),
    ],
    [
      'wrong producer',
      (event: Record<string, unknown>) => (event.producer = 'other'),
    ],
    [
      'non-positive version',
      (event: Record<string, unknown>) =>
        ((event.payload as Record<string, unknown>).recordVersion = 0),
    ],
    [
      'non-canonical time',
      (event: Record<string, unknown>) => (event.occurredAt = '2026-09-12'),
    ],
  ])('rejects %s before persistence', (_name, mutate) => {
    const event = validEvents()[0];
    mutate(event);
    expect(() => parseLoyaltyProjectionEvent(event)).toThrow(
      BadRequestException,
    );
  });

  it('rejects invalid money, enum, append-only version and self-referral', () => {
    const events = validEvents();
    (events[4].payload as Record<string, unknown>).lockedPriceIrr = 100;
    (events[0].payload as Record<string, unknown>).level = 'DIAMOND';
    (events[1].payload as Record<string, unknown>).recordVersion = 2;
    const referral = events[5].payload as Record<string, unknown>;
    referral.referredUserId = referral.referrerUserId;

    for (const event of [events[4], events[0], events[1], events[5]]) {
      expect(() => parseLoyaltyProjectionEvent(event)).toThrow(
        BadRequestException,
      );
    }
  });

  it('returns a detached event snapshot', () => {
    const input = validEvents()[0];
    const parsed = parseLoyaltyProjectionEvent(input);

    (input.payload as Record<string, unknown>).fullName = 'changed';

    expect(parsed.payload).toMatchObject({ fullName: 'Member' });
  });
});
