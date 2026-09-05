import {
  CanonicalEventType,
  createCanonicalEvent,
  isCanonicalEvent,
} from './canonical-events';

describe('canonical event envelope', () => {
  it('creates a versioned, correlated and idempotent envelope', () => {
    const event = createCanonicalEvent({
      eventType: CanonicalEventType.ORDER_CREATED,
      producer: 'core-commerce',
      aggregateType: 'Order',
      aggregateId: 'order-1',
      correlationId: 'request-1',
      idempotencyKey: 'order-1-created',
      occurredAt: new Date('2026-09-05T12:00:00.000Z'),
      payload: { orderStatus: 'HELD' },
    });

    expect(event).toMatchObject({
      eventType: 'OrderCreated',
      eventVersion: 1,
      occurredAt: '2026-09-05T12:00:00.000Z',
      producer: 'core-commerce',
      aggregateId: 'order-1',
      correlationId: 'request-1',
      idempotencyKey: 'order-1-created',
    });
    expect(isCanonicalEvent(event)).toBe(true);
  });

  it.each([
    { eventVersion: 2 },
    { eventType: 'UnknownEvent' },
    { occurredAt: 'not-a-date' },
    { aggregateId: '' },
    { payload: undefined },
  ])('rejects malformed envelope changes: %j', (change) => {
    const event = createCanonicalEvent({
      eventType: CanonicalEventType.PAYMENT_CONFIRMED,
      producer: 'core-commerce',
      aggregateType: 'Payment',
      aggregateId: 'payment-1',
      correlationId: 'request-1',
      idempotencyKey: 'payment-1-confirmed',
      payload: { amountIrr: '1000' },
    });
    const malformed = { ...event, ...change };
    expect(isCanonicalEvent(malformed)).toBe(false);
  });
});
