import type { CanonicalEvent } from './canonical-events';

export type CoreItinerarySchemaEventType =
  'OrderCreated' | 'PaymentConfirmed' | 'TicketIssued' | 'RefundRequested';

function schema<TFields extends readonly string[]>(
  eventType: CoreItinerarySchemaEventType,
  payloadFields: TFields,
) {
  return Object.freeze({
    schemaId: `blujet.core-itinerary.${eventType}.v1` as const,
    eventType,
    eventVersion: 1 as const,
    producer: 'core-commerce' as const,
    aggregateType: 'CoreItineraryOrder' as const,
    payloadFields: Object.freeze(payloadFields),
  });
}

export const CoreItineraryEventSchemaCatalog = Object.freeze({
  OrderCreated: schema('OrderCreated', [
    'auditId',
    'orderVersion',
    'currency',
    'channel',
    'status',
    'fareIrr',
    'taxIrr',
    'extrasIrr',
    'totalIrr',
    'holdExpiresAt',
  ] as const),
  PaymentConfirmed: schema('PaymentConfirmed', [
    'auditId',
    'orderVersion',
    'currency',
    'confirmationId',
    'status',
    'amountIrr',
  ] as const),
  TicketIssued: schema('TicketIssued', [
    'auditId',
    'orderVersion',
    'currency',
    'status',
    'ticketDocumentIds',
    'issuedAt',
  ] as const),
  RefundRequested: schema('RefundRequested', [
    'auditId',
    'orderVersion',
    'currency',
    'refundId',
    'refundReference',
    'quoteReference',
    'status',
    'grossAmountIrr',
    'penaltyAmountIrr',
    'refundableIrr',
  ] as const),
});

export type CoreItineraryEventSchema =
  (typeof CoreItineraryEventSchemaCatalog)[CoreItinerarySchemaEventType];

export function coreItineraryEventSchema(
  event: CanonicalEvent,
): CoreItineraryEventSchema | undefined {
  if (
    event.producer !== 'core-commerce' ||
    event.aggregateType !== 'CoreItineraryOrder' ||
    event.eventVersion !== 1
  )
    return undefined;

  switch (event.eventType) {
    case 'OrderCreated':
      return CoreItineraryEventSchemaCatalog.OrderCreated;
    case 'PaymentConfirmed':
      return CoreItineraryEventSchemaCatalog.PaymentConfirmed;
    case 'TicketIssued':
      return CoreItineraryEventSchemaCatalog.TicketIssued;
    case 'RefundRequested':
      return CoreItineraryEventSchemaCatalog.RefundRequested;
    case 'FlightDisrupted':
    case 'CartableTaskProjected':
    case 'LoyaltyMemberProjected':
    case 'LoyaltyPointsEntryProjected':
    case 'LoyaltyCardRequestProjected':
    case 'LoyaltyTierRuleProjected':
    case 'LoyaltyPriceLockProjected':
    case 'LoyaltyReferralProjected':
      return undefined;
  }
}
