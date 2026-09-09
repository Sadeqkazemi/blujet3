import { createCanonicalEvent } from './canonical-events';
import {
  CoreItineraryEventSchemaCatalog,
  coreItineraryEventSchema,
} from './core-itinerary-event-schema';
import { createItineraryOrderCreated } from './core-itinerary-events';

describe('Core itinerary event schema catalog', () => {
  it('publishes stable v1 identities and exact payload fields', () => {
    expect(CoreItineraryEventSchemaCatalog.OrderCreated).toMatchObject({
      schemaId: 'blujet.core-itinerary.OrderCreated.v1',
      eventType: 'OrderCreated',
      eventVersion: 1,
    });
    expect(CoreItineraryEventSchemaCatalog.OrderCreated.payloadFields).toEqual([
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
    ]);
    expect(CoreItineraryEventSchemaCatalog.PaymentConfirmed).toMatchObject({
      schemaId: 'blujet.core-itinerary.PaymentConfirmed.v1',
      eventType: 'PaymentConfirmed',
      eventVersion: 1,
    });
    expect(
      CoreItineraryEventSchemaCatalog.PaymentConfirmed.payloadFields,
    ).toEqual([
      'auditId',
      'orderVersion',
      'currency',
      'confirmationId',
      'status',
      'amountIrr',
    ]);
    expect(CoreItineraryEventSchemaCatalog.TicketIssued).toMatchObject({
      schemaId: 'blujet.core-itinerary.TicketIssued.v1',
      eventType: 'TicketIssued',
      eventVersion: 1,
    });
    expect(CoreItineraryEventSchemaCatalog.TicketIssued.payloadFields).toEqual([
      'auditId',
      'orderVersion',
      'currency',
      'status',
      'ticketDocumentIds',
      'issuedAt',
    ]);
    expect(CoreItineraryEventSchemaCatalog.RefundRequested).toMatchObject({
      schemaId: 'blujet.core-itinerary.RefundRequested.v1',
      eventType: 'RefundRequested',
      eventVersion: 1,
    });
    expect(
      CoreItineraryEventSchemaCatalog.RefundRequested.payloadFields,
    ).toEqual([
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
    ]);
    for (const contract of Object.values(CoreItineraryEventSchemaCatalog)) {
      expect(contract.producer).toBe('core-commerce');
      expect(contract.aggregateType).toBe('CoreItineraryOrder');
      expect(Object.isFrozen(contract)).toBe(true);
      expect(Object.isFrozen(contract.payloadFields)).toBe(true);
      expect(contract.payloadFields.join(',')).not.toMatch(
        /phone|passport|national|owner|paymentReference/i,
      );
    }
  });

  it('resolves only validated routing identities covered by the catalog', () => {
    const itinerary = createItineraryOrderCreated(
      {
        id: 'order-1',
        version: 1,
        status: 'HELD',
        channel: 'SYSTEM',
        currency: 'IRR',
        fareIrr: 100n,
        taxIrr: 20n,
        extrasIrr: 0n,
        totalIrr: 120n,
        createdAt: new Date('2026-09-09T00:00:00.000Z'),
        holdExpiresAt: new Date('2026-09-09T00:15:00.000Z'),
      },
      {
        auditId: 'audit-1',
        correlationId: 'request-1',
        idempotencyKey: 'order-created-1',
      },
    );
    expect(coreItineraryEventSchema(itinerary)).toBe(
      CoreItineraryEventSchemaCatalog.OrderCreated,
    );

    const generic = createCanonicalEvent({
      eventType: 'OrderCreated',
      producer: 'another-service',
      aggregateType: 'Order',
      aggregateId: 'order-1',
      correlationId: 'request-1',
      idempotencyKey: 'order-created-1',
      payload: {},
    });
    expect(coreItineraryEventSchema(generic)).toBeUndefined();
    expect(
      coreItineraryEventSchema({
        ...generic,
        eventType: 'FlightDisrupted',
        producer: 'core-commerce',
        aggregateType: 'CoreItineraryOrder',
      }),
    ).toBeUndefined();
  });
});
