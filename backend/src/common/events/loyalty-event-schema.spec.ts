import { createCanonicalEvent } from './canonical-events';
import { knownEventSchema } from './event-schema';
import {
  LoyaltyEventSchemaCatalog,
  loyaltyEventSchema,
} from './loyalty-event-schema';

describe('LoyaltyEventSchemaCatalog', () => {
  it('freezes all six v1 Loyalty schema identities and aggregate mappings', () => {
    expect(
      Object.values(LoyaltyEventSchemaCatalog).map((entry) => ({
        schemaId: entry.schemaId,
        eventType: entry.eventType,
        producer: entry.producer,
        aggregateType: entry.aggregateType,
      })),
    ).toEqual([
      {
        schemaId: 'blujet.loyalty.LoyaltyMemberProjected.v1',
        eventType: 'LoyaltyMemberProjected',
        producer: 'core-loyalty',
        aggregateType: 'LoyaltyMember',
      },
      {
        schemaId: 'blujet.loyalty.LoyaltyPointsEntryProjected.v1',
        eventType: 'LoyaltyPointsEntryProjected',
        producer: 'core-loyalty',
        aggregateType: 'LoyaltyPointsEntry',
      },
      {
        schemaId: 'blujet.loyalty.LoyaltyCardRequestProjected.v1',
        eventType: 'LoyaltyCardRequestProjected',
        producer: 'core-loyalty',
        aggregateType: 'LoyaltyCardRequest',
      },
      {
        schemaId: 'blujet.loyalty.LoyaltyTierRuleProjected.v1',
        eventType: 'LoyaltyTierRuleProjected',
        producer: 'core-loyalty',
        aggregateType: 'LoyaltyTierRule',
      },
      {
        schemaId: 'blujet.loyalty.LoyaltyPriceLockProjected.v1',
        eventType: 'LoyaltyPriceLockProjected',
        producer: 'core-loyalty',
        aggregateType: 'LoyaltyPriceLock',
      },
      {
        schemaId: 'blujet.loyalty.LoyaltyReferralProjected.v1',
        eventType: 'LoyaltyReferralProjected',
        producer: 'core-loyalty',
        aggregateType: 'LoyaltyReferral',
      },
    ]);
  });

  it('resolves only an exact Loyalty producer and aggregate pair', () => {
    const event = createCanonicalEvent({
      eventType: 'LoyaltyMemberProjected',
      producer: 'core-loyalty',
      aggregateType: 'LoyaltyMember',
      aggregateId: 'member-1',
      correlationId: 'request-1',
      idempotencyKey: 'member-1-v1',
      payload: {},
    });
    expect(loyaltyEventSchema(event)).toBe(
      LoyaltyEventSchemaCatalog.LoyaltyMemberProjected,
    );
    expect(knownEventSchema(event)).toBe(
      LoyaltyEventSchemaCatalog.LoyaltyMemberProjected,
    );
    expect(
      loyaltyEventSchema({ ...event, aggregateType: 'LoyaltyReferral' }),
    ).toBeUndefined();
    expect(
      loyaltyEventSchema({ ...event, producer: 'other-service' }),
    ).toBeUndefined();
  });
});
