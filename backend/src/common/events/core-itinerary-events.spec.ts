import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CommerceInboxService } from '../../modules/commerce-inbox/commerce-inbox.service';
import { CommerceOutboxService } from '../../modules/commerce-outbox/commerce-outbox.service';
import { isCanonicalEvent } from './canonical-events';
import {
  createItineraryOrderCreated,
  createItineraryPaymentConfirmed,
  createItineraryRefundRequested,
  createItineraryTicketIssued,
  parseCoreItineraryEvent,
} from './core-itinerary-events';

describe('Core itinerary typed events', () => {
  const order: Parameters<typeof createItineraryOrderCreated>[0] = {
    id: 'legacy-order-1',
    version: 1,
    status: 'HELD',
    channel: 'SYSTEM',
    currency: 'IRR',
    fareIrr: 9007199254740993n,
    taxIrr: 7n,
    extrasIrr: 0n,
    totalIrr: 9007199254741000n,
    createdAt: new Date('2026-09-06T00:00:00.000Z'),
    holdExpiresAt: new Date('2026-09-06T00:15:00.000Z'),
  };
  const context = {
    auditId: 'audit-1',
    correlationId: 'request-1',
    idempotencyKey: 'order-created-1',
  };
  const confirmation: Parameters<typeof createItineraryPaymentConfirmed>[1] = {
    id: 'confirmation-1',
    orderId: order.id,
    status: 'COMPLETED',
    currency: 'IRR',
    amountIrr: order.totalIrr,
    failureCode: null,
    updatedAt: new Date('2026-09-06T00:05:00.000Z'),
  };
  const created = () => createItineraryOrderCreated(order, context);
  const paid = () =>
    createItineraryPaymentConfirmed(
      { ...order, status: 'TICKETED', version: 2 },
      confirmation,
      context,
    );
  const documents: Parameters<typeof createItineraryTicketIssued>[1] = [
    {
      id: 'ticket-document-1',
      orderId: order.id,
      status: 'ISSUED',
      accountabilityStatus: 'ACCOUNTABLE',
      issueSource: 'CORE_ITINERARY_PAYMENT',
      issuedAt: new Date('2026-09-06T00:06:00.000Z'),
    },
  ];
  const refund: Parameters<typeof createItineraryRefundRequested>[1] = {
    id: 'refund-1',
    orderId: order.id,
    status: 'RECEIVED',
    refundReference: 'refund-reference-1',
    quoteReference: 'quote-reference-1',
    grossAmountIrr: 1000n,
    penaltyAmountIrr: 300n,
    refundableIrr: 700n,
    currency: 'IRR',
    createdAt: new Date('2026-09-06T00:07:00.000Z'),
  };
  it('builds exact historical OrderCreated with lossless money and no entity PII', () => {
    const source = {
      ...order,
      pnr: 'SECRET',
      ownerId: 'private-owner',
      contactPhone: 'private-phone',
    };
    const event = createItineraryOrderCreated(source, context);
    expect(event).toMatchObject({
      eventType: 'OrderCreated',
      aggregateType: 'CoreItineraryOrder',
      aggregateId: order.id,
      occurredAt: order.createdAt.toISOString(),
      producer: 'core-commerce',
      payload: {
        auditId: context.auditId,
        totalIrr: '9007199254741000',
        status: 'HELD',
      },
    });
    expect(Object.keys(event.payload).sort()).toEqual([
      'auditId',
      'channel',
      'currency',
      'extrasIrr',
      'fareIrr',
      'holdExpiresAt',
      'orderVersion',
      'status',
      'taxIrr',
      'totalIrr',
    ]);
    expect(JSON.stringify(event)).not.toMatch(/SECRET|private/);
  });
  it('builds a completed payment without payment reference or account data', () => {
    const source = { ...confirmation, paymentReference: 'private-reference' };
    const event = createItineraryPaymentConfirmed(
      { ...order, status: 'TICKETED', version: 2 },
      source,
      context,
    );
    expect(event.payload).toEqual({
      auditId: 'audit-1',
      orderVersion: 2,
      currency: 'IRR',
      confirmationId: 'confirmation-1',
      status: 'COMPLETED',
      amountIrr: '9007199254741000',
    });
    expect(event.occurredAt).toBe(confirmation.updatedAt.toISOString());
    expect(isCanonicalEvent(event)).toBe(true);
    expect(JSON.stringify(event)).not.toContain('private-reference');
  });
  it('builds a ticket event from accountable issued documents only', () => {
    const event = createItineraryTicketIssued(
      { ...order, status: 'TICKETED' },
      documents,
      context,
    );
    expect(event.payload).toEqual({
      auditId: 'audit-1',
      orderVersion: 1,
      currency: 'IRR',
      status: 'TICKETED',
      ticketDocumentIds: ['ticket-document-1'],
      issuedAt: '2026-09-06T00:06:00.000Z',
    });
    expect(Object.keys(event.payload).sort()).toEqual([
      'auditId',
      'currency',
      'issuedAt',
      'orderVersion',
      'status',
      'ticketDocumentIds',
    ]);
  });
  it('builds a refund request with an immutable IRR quote snapshot', () => {
    const event = createItineraryRefundRequested(
      { id: order.id, version: 2, status: 'TICKETED' },
      refund,
      context,
    );
    expect(event.payload).toEqual({
      auditId: 'audit-1',
      orderVersion: 2,
      currency: 'IRR',
      refundId: 'refund-1',
      refundReference: 'refund-reference-1',
      quoteReference: 'quote-reference-1',
      status: 'RECEIVED',
      grossAmountIrr: '1000',
      penaltyAmountIrr: '300',
      refundableIrr: '700',
    });
    expect(isCanonicalEvent(event)).toBe(true);
  });
  it('detaches the parsed event and preserves discriminated payload types', () => {
    const input = created();
    const parsed = parseCoreItineraryEvent(input);
    input.payload.totalIrr = '0';
    if (parsed.eventType !== 'OrderCreated')
      throw new Error('Unexpected fixture type');
    expect(parsed.payload.totalIrr).toBe('9007199254741000');
  });
  it.each([
    { auditId: '' },
    { auditId: 'private data' },
    { auditId: undefined },
    { orderVersion: 0 },
    { orderVersion: 1.5 },
    { orderVersion: 2147483648 },
    { currency: 'IRT' },
    { currency: 'USD' },
    { status: 'TICKETED' },
    { channel: 'STAFF' },
    { channel: ['SYSTEM'] },
    { fareIrr: 1000 },
    { fareIrr: '-1' },
    { fareIrr: '1.5' },
    { fareIrr: '01' },
    { fareIrr: '+1' },
    { fareIrr: '1e3' },
    { fareIrr: '۱۰۰' },
    { fareIrr: '9223372036854775808' },
    { fareIrr: '9'.repeat(1000) },
    { totalIrr: '1' },
    { contactPhone: 'private' },
    { ownerId: 'private' },
    { holdExpiresAt: 'invalid' },
    { holdExpiresAt: '2026-09-06' },
    { holdExpiresAt: '2026-09-06T00:00:00.000Z' },
  ])('rejects invalid order payload (%#)', (change) => {
    const event = created();
    expect(() =>
      parseCoreItineraryEvent({
        ...event,
        payload: { ...event.payload, ...change },
      }),
    ).toThrow(BadRequestException);
  });
  it.each([
    { producer: 'other-service' },
    { aggregateType: 'Order' },
    { eventType: 'TicketIssued' },
    { eventVersion: 2 },
    { correlationId: 'customer@email.test' },
    { idempotencyKey: ' space' },
    { aggregateId: '' },
    { eventId: 'bad' },
    { occurredAt: 'invalid' },
    { payload: null },
  ])('rejects incompatible envelopes (%#)', (change) => {
    expect(() => parseCoreItineraryEvent({ ...created(), ...change })).toThrow(
      BadRequestException,
    );
  });
  it.each([
    { status: 'PAID' },
    { ticketDocumentIds: [] },
    { ticketDocumentIds: ['ticket-document-1', 'ticket-document-1'] },
    { ticketDocumentIds: ['private data'] },
    { issuedAt: '2026-09-06T00:06:00Z' },
    { paymentReference: 'private' },
  ])('rejects invalid ticket payload (%#)', (change) => {
    const event = createItineraryTicketIssued(
      { ...order, status: 'TICKETED' },
      documents,
      context,
    );
    expect(() =>
      parseCoreItineraryEvent({
        ...event,
        payload: { ...event.payload, ...change },
      }),
    ).toThrow(BadRequestException);
  });
  it.each([
    { status: 'COMPLETED' },
    { grossAmountIrr: '1' },
    { penaltyAmountIrr: '1001' },
    { refundableIrr: '0' },
    { refundReference: '' },
    { quoteReference: 'private quote' },
    { ownerId: 'private-owner' },
  ])('rejects invalid refund payload (%#)', (change) => {
    const event = createItineraryRefundRequested(
      { id: order.id, version: 2, status: 'TICKETED' },
      refund,
      context,
    );
    expect(() =>
      parseCoreItineraryEvent({
        ...event,
        payload: { ...event.payload, ...change },
      }),
    ).toThrow(BadRequestException);
  });
  it.each([
    { status: 'RECEIVED' },
    { status: 'REVIEW_REQUIRED' },
    { confirmationId: '' },
    { amountIrr: '0' },
    { amountIrr: '-1' },
    { amountIrr: 1000 },
    { amountIrr: '1.2' },
    { paymentReference: 'private' },
    { currency: 'USD' },
    { auditId: '' },
  ])('rejects invalid confirmation payload (%#)', (change) => {
    const event = paid();
    expect(() =>
      parseCoreItineraryEvent({
        ...event,
        payload: { ...event.payload, ...change },
      }),
    ).toThrow(BadRequestException);
  });
  it('accepts zero order amounts and the PostgreSQL bigint ceiling without rounding', () => {
    expect(
      createItineraryOrderCreated(
        { ...order, fareIrr: 0n, taxIrr: 0n, totalIrr: 0n },
        context,
      ).payload.totalIrr,
    ).toBe('0');
    expect(
      createItineraryOrderCreated(
        {
          ...order,
          fareIrr: 9223372036854775807n,
          taxIrr: 0n,
          totalIrr: 9223372036854775807n,
        },
        context,
      ).payload.totalIrr,
    ).toBe('9223372036854775807');
  });
  it('rejects incomplete, mismatched or review-required payment snapshots', () => {
    const ticketed = { ...order, status: 'TICKETED' as const };
    expect(() =>
      createItineraryPaymentConfirmed(order, confirmation, context),
    ).toThrow(BadRequestException);
    for (const change of [
      { orderId: 'other' },
      { status: 'RECEIVED' as const },
      { status: 'REVIEW_REQUIRED' as const },
      { failureCode: 'review' },
      { amountIrr: 1n },
      { updatedAt: new Date('invalid') },
    ])
      expect(() =>
        createItineraryPaymentConfirmed(
          ticketed,
          { ...confirmation, ...change },
          context,
        ),
      ).toThrow(BadRequestException);
  });
  it('rejects ticket and refund builders when their source state is unsafe', () => {
    expect(() =>
      createItineraryTicketIssued(order, documents, context),
    ).toThrow(BadRequestException);
    for (const change of [
      { orderId: 'other' },
      { status: 'RECEIVED' as const },
      { accountabilityStatus: 'OTHER' as never },
      { issueSource: 'NIRA' as never },
      { issuedAt: new Date('invalid') },
    ])
      expect(() =>
        createItineraryTicketIssued(
          { ...order, status: 'TICKETED' },
          [{ ...documents[0], ...change }],
          context,
        ),
      ).toThrow(BadRequestException);
    for (const change of [
      { orderId: 'other' },
      { status: 'REVIEW_REQUIRED' as const },
      { currency: 'USD' as never },
      { grossAmountIrr: 1n },
    ])
      expect(() =>
        createItineraryRefundRequested(
          { id: order.id, version: 2, status: 'TICKETED' },
          { ...refund, ...change },
          context,
        ),
      ).toThrow(BadRequestException);
  });
  it('rejects wrong builder scalar types at runtime', () => {
    expect(() =>
      createItineraryOrderCreated(
        { ...order, createdAt: new Date('invalid') },
        context,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      createItineraryOrderCreated(
        { ...order, fareIrr: 1 as unknown as bigint },
        context,
      ),
    ).toThrow(BadRequestException);
  });
  it('rejects strict inbox/outbox input before database access while generic v1 remains valid', () => {
    const event = { ...created(), payload: { amountIrr: '1000' } };
    expect(isCanonicalEvent(event)).toBe(true);
    const transaction = jest.fn();
    const inbox = new CommerceInboxService({
      transaction,
    } as unknown as DataSource);
    const apply = jest.fn();
    expect(() => inbox.consumeItinerary('core-reader', event, apply)).toThrow(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    const getRepository = jest.fn();
    const manager = { getRepository } as unknown as EntityManager;
    expect(() =>
      new CommerceOutboxService().enqueueItinerary(manager, event),
    ).toThrow(BadRequestException);
    expect(getRepository).not.toHaveBeenCalled();
  });
});
