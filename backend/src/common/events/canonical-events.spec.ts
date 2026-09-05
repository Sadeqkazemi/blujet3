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
    { payload: null },
    { payload: [] },
    { payload: { amount: 1.5 } },
    { payload: { amount: Number.MAX_SAFE_INTEGER + 1 } },
    { payload: { amount: Number.NaN } },
    { payload: { amount: BigInt(1) } },
    { payload: { date: new Date() } },
    { payload: { value: undefined } },
    { payload: { large: 'x'.repeat(256 * 1024) } },
    { eventId: 'not-a-uuid' },
    { occurredAt: '2026-01-01' },
    { extra: true },
    { producer: ' leading-space' },
    { correlationId: 'x'.repeat(257) },
  ])('rejects malformed envelope changes (case %#)', (change) => {
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

  it('rejects cyclic payloads without throwing', () => {
    const payload: Record<string, unknown> = {};
    payload.self = payload;
    expect(
      isCanonicalEvent(
        createCanonicalEvent({
          eventType: CanonicalEventType.ORDER_CREATED,
          producer: 'core',
          aggregateType: 'Order',
          aggregateId: 'id',
          correlationId: 'request',
          idempotencyKey: 'command',
          payload,
        }),
      ),
    ).toBe(false);
  });
});
