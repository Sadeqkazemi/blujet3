import type { CanonicalEvent } from './canonical-events';

export type LoyaltySchemaEventType =
  | 'LoyaltyMemberProjected'
  | 'LoyaltyPointsEntryProjected'
  | 'LoyaltyCardRequestProjected'
  | 'LoyaltyTierRuleProjected'
  | 'LoyaltyPriceLockProjected'
  | 'LoyaltyReferralProjected';

type LoyaltyAggregateType =
  | 'LoyaltyMember'
  | 'LoyaltyPointsEntry'
  | 'LoyaltyCardRequest'
  | 'LoyaltyTierRule'
  | 'LoyaltyPriceLock'
  | 'LoyaltyReferral';

function schema<TFields extends readonly string[]>(
  eventType: LoyaltySchemaEventType,
  aggregateType: LoyaltyAggregateType,
  payloadFields: TFields,
) {
  return Object.freeze({
    schemaId: `blujet.loyalty.${eventType}.v1` as const,
    eventType,
    eventVersion: 1 as const,
    producer: 'core-loyalty' as const,
    aggregateType,
    payloadFields: Object.freeze(payloadFields),
  });
}

export const LoyaltyEventSchemaCatalog = Object.freeze({
  LoyaltyMemberProjected: schema('LoyaltyMemberProjected', 'LoyaltyMember', [
    'auditId',
    'recordVersion',
    'userId',
    'fullName',
    'email',
    'birthDate',
    'nationalIdEnc',
    'nationalIdHash',
    'joinDate',
    'points',
    'level',
    'cardStatus',
    'cardNo',
    'issuedByLabelFa',
    'createdAt',
    'deactivatedAt',
    'deactivatedById',
  ] as const),
  LoyaltyPointsEntryProjected: schema(
    'LoyaltyPointsEntryProjected',
    'LoyaltyPointsEntry',
    [
      'auditId',
      'recordVersion',
      'clubMemberId',
      'type',
      'signedPoints',
      'bookingId',
      'createdAt',
    ] as const,
  ),
  LoyaltyCardRequestProjected: schema(
    'LoyaltyCardRequestProjected',
    'LoyaltyCardRequest',
    [
      'auditId',
      'recordVersion',
      'memberId',
      'level',
      'points',
      'status',
      'assignedTo',
      'decidedById',
      'decidedAt',
      'cardNo',
      'history',
      'createdAt',
    ] as const,
  ),
  LoyaltyTierRuleProjected: schema(
    'LoyaltyTierRuleProjected',
    'LoyaltyTierRule',
    [
      'auditId',
      'recordVersion',
      'goldMinPoints',
      'platinumMinPoints',
      'cardRequestMinPoints',
      'updatedById',
      'updatedAt',
      'createdAt',
    ] as const,
  ),
  LoyaltyPriceLockProjected: schema(
    'LoyaltyPriceLockProjected',
    'LoyaltyPriceLock',
    [
      'auditId',
      'recordVersion',
      'userId',
      'flightInstanceId',
      'cabin',
      'lockedPriceIrr',
      'feeIrr',
      'feeCharged',
      'status',
      'expiresAt',
      'createdAt',
      'bookingId',
    ] as const,
  ),
  LoyaltyReferralProjected: schema(
    'LoyaltyReferralProjected',
    'LoyaltyReferral',
    [
      'auditId',
      'recordVersion',
      'referrerUserId',
      'referredUserId',
      'status',
      'pointsAwarded',
      'firstBookingId',
      'rewardedAt',
      'createdAt',
      'updatedAt',
    ] as const,
  ),
});

export type LoyaltyEventSchema =
  (typeof LoyaltyEventSchemaCatalog)[LoyaltySchemaEventType];

export function loyaltyEventSchema(
  event: CanonicalEvent,
): LoyaltyEventSchema | undefined {
  if (event.producer !== 'core-loyalty' || event.eventVersion !== 1)
    return undefined;
  const candidate =
    LoyaltyEventSchemaCatalog[
      event.eventType as keyof typeof LoyaltyEventSchemaCatalog
    ];
  if (!candidate || candidate.aggregateType !== event.aggregateType)
    return undefined;
  return candidate;
}
