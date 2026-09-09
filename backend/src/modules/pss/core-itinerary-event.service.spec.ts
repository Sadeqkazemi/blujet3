import type { EntityManager } from 'typeorm';
import type { CoreItineraryOrder } from '../../database/entities/core-itinerary-order.entity';
import type { CoreItineraryPaymentConfirmation } from '../../database/entities/core-itinerary-payment-confirmation.entity';
import type { CoreItineraryTicketDocument } from '../../database/entities/core-itinerary-ticket-document.entity';
import { CoreItineraryEventService } from './core-itinerary-event.service';

function managerFor(role: 'USER' | 'AGENCY' = 'USER') {
  return {
    findOne: jest.fn().mockResolvedValue({ id: 'owner-1', role }),
  } as unknown as EntityManager;
}

function order(): CoreItineraryOrder {
  return {
    id: 'order-1',
    ownerId: 'owner-1',
    pnr: 'BJTEST1',
    version: 1,
    channel: 'SYSTEM',
    status: 'HELD',
    currency: 'IRR',
    fareIrr: 100n,
    taxIrr: 9n,
    extrasIrr: 0n,
    totalIrr: 109n,
    holdExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
    createdAt: new Date('2029-12-31T00:00:00.000Z'),
  } as CoreItineraryOrder;
}

describe('CoreItineraryEventService', () => {
  it('writes audit, outbox and fulfilment saga for a hold', async () => {
    const audit = {
      record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    const outbox = {
      enqueueItinerary: jest.fn().mockResolvedValue({ eventId: 'event-1' }),
    };
    const saga = {
      start: jest.fn().mockResolvedValue({ id: 'saga-1' }),
      advance: jest.fn(),
    };
    const service = new CoreItineraryEventService(
      audit as never,
      outbox as never,
      saga as never,
    );

    await service.orderCreated(managerFor(), order());

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'order-1' }),
      expect.anything(),
    );
    expect(outbox.enqueueItinerary).toHaveBeenCalledTimes(1);
    expect(outbox.enqueueItinerary).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ eventType: 'OrderCreated' }),
    );
    expect(saga.start).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        aggregateId: 'order-1',
        currentStep: 'HOLD_CREATED',
      }),
    );
  });

  it('records payment and ticket events and completes the fulfilment saga', async () => {
    const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    const outbox = {
      enqueueItinerary: jest.fn().mockResolvedValue({ eventId: 'event-1' }),
    };
    const saga = {
      start: jest.fn().mockResolvedValue({ id: 'saga-1' }),
      advance: jest.fn(),
    };
    const service = new CoreItineraryEventService(
      audit as never,
      outbox as never,
      saga as never,
    );
    const paidOrder = { ...order(), status: 'TICKETED' } as CoreItineraryOrder;
    const confirmation = {
      id: 'confirmation-1',
      orderId: 'order-1',
      status: 'COMPLETED',
      currency: 'IRR',
      amountIrr: 109n,
      failureCode: null,
      updatedAt: new Date('2029-12-31T00:01:00.000Z'),
    } as CoreItineraryPaymentConfirmation;
    const documents = [
      {
        id: 'document-1',
        orderId: 'order-1',
        status: 'ISSUED',
        accountabilityStatus: 'ACCOUNTABLE',
        issueSource: 'CORE_ITINERARY_PAYMENT',
        issuedAt: new Date('2029-12-31T00:01:00.000Z'),
      },
    ] as CoreItineraryTicketDocument[];

    await service.paymentConfirmed(
      managerFor(),
      paidOrder,
      confirmation,
      documents,
    );

    expect(
      outbox.enqueueItinerary.mock.calls
        .map((call: unknown[]) => call[1])
        .map((event: { eventType: string }) => event.eventType),
    ).toEqual(['PaymentConfirmed', 'TicketIssued']);
    expect(saga.advance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'COMPLETED' }),
    );
  });

  it('fails closed to manual reconciliation when fulfilment fails', async () => {
    const audit = { record: jest.fn() };
    const outbox = { enqueueItinerary: jest.fn() };
    const saga = {
      start: jest.fn().mockResolvedValue({ id: 'saga-1' }),
      advance: jest.fn(),
    };
    const service = new CoreItineraryEventService(
      audit as never,
      outbox as never,
      saga as never,
    );

    await service.fulfilmentFailed(
      managerFor(),
      order(),
      'TICKET_STOCK_UNAVAILABLE',
    );

    expect(saga.advance).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'COMPENSATION_REQUIRED',
        currentStep: 'MANUAL_RECONCILIATION_REQUIRED',
        failureCode: 'TICKET_STOCK_UNAVAILABLE',
      }),
    );
  });
});
