import { BadRequestException } from '@nestjs/common';
import type { CanonicalEvent } from './canonical-events';
import {
  createAgencyCreditRequestProjected,
  createAgencyInvoiceProjected,
  createAgencyProfileProjected,
  parseAgencyProjectionEvent,
  type AgencyProjectionEvent,
  type AgencyProjectionEventContext,
} from './agency-events';

describe('Agency projection events', () => {
  const createdAt = new Date('2026-09-13T08:00:00.000Z');
  const context = (recordVersion = 1): AgencyProjectionEventContext => ({
    auditId: `audit-${recordVersion}`,
    correlationId: 'request-1',
    idempotencyKey: `agency-record-v${recordVersion}`,
    occurredAt: new Date('2026-09-13T09:00:00.000Z'),
    recordVersion,
  });

  const profile = () =>
    createAgencyProfileProjected(
      {
        userId: 'agency-1',
        licenseNo: 'LICENSE-1',
        managerName: 'مدیر نمونه',
        phone: '09121234567',
        email: 'agency@example.test',
        city: 'تهران',
        address: 'نشانی نمونه',
        tier: 'GOLD',
        suspendedAt: null,
        suspendReason: null,
        joinedAt: createdAt,
      },
      context(2),
    );

  const invoice = () =>
    createAgencyInvoiceProjected(
      {
        id: 'invoice-1',
        agencyId: 'agency-1',
        invoiceNo: 'INV-1',
        issuedById: 'staff-1',
        issuedAt: createdAt,
        dueAt: new Date('2026-09-20T08:00:00.000Z'),
        amountIrr: 9_007_199_254_740_993n,
        status: 'UNPAID',
        paidAt: null,
        descriptionFa: 'صورتحساب نمونه',
        bookingId: 'booking-1',
      },
      context(),
    );

  const creditRequest = () =>
    createAgencyCreditRequestProjected(
      {
        id: 'credit-1',
        agencyId: 'agency-1',
        requestedLimitIrr: 20_000_000_000n,
        note: null,
        status: 'PENDING',
        decidedById: null,
        decidedAt: null,
        createdAt,
      },
      context(),
    );

  const all = (): AgencyProjectionEvent[] => [
    profile(),
    invoice(),
    creditRequest(),
  ];

  it('builds three exact v1 full snapshots', () => {
    const events = all();
    expect(events.map((event) => event.eventType)).toEqual([
      'AgencyProfileProjected',
      'AgencyInvoiceProjected',
      'AgencyCreditRequestProjected',
    ]);
    expect(events.map((event) => event.aggregateType)).toEqual([
      'AgencyProfile',
      'AgencyInvoice',
      'AgencyCreditRequest',
    ]);
    expect(events.every((event) => event.producer === 'core-agency')).toBe(
      true,
    );
    expect(events.every((event) => event.eventVersion === 1)).toBe(true);
  });

  it('preserves bigint IRR as a lossless decimal string', () => {
    expect(invoice().payload.amountIrr).toBe('9007199254740993');
    expect(creditRequest().payload.requestedLimitIrr).toBe('20000000000');
  });

  it('accepts empty source-compatible optional text fields', () => {
    const profileEvent = profile();
    expect(
      parseAgencyProjectionEvent({
        ...profileEvent,
        payload: {
          ...profileEvent.payload,
          email: '',
          city: '',
          address: '',
        },
      }).payload,
    ).toMatchObject({ email: '', city: '', address: '' });
    expect(
      createAgencyInvoiceProjected(
        {
          ...invoice().payload,
          id: 'invoice-2',
          amountIrr: 1n,
          issuedAt: createdAt,
          dueAt: createdAt,
          paidAt: null,
          descriptionFa: '',
        },
        context(),
      ).payload.descriptionFa,
    ).toBe('');
  });

  it.each(all())('parses and detaches valid $eventType snapshots', (event) => {
    const parsed = parseAgencyProjectionEvent(event);
    expect(parsed).toEqual(event);
    expect(parsed).not.toBe(event);
    expect(parsed.payload).not.toBe(event.payload);
  });

  it.each([
    { auditId: '' },
    { recordVersion: 0 },
    { recordVersion: 1.5 },
    { recordVersion: 2_147_483_648 },
    { unexpected: true },
  ])('rejects invalid common payload fields (%#)', (change) => {
    const event = profile();
    expect(() =>
      parseAgencyProjectionEvent({
        ...event,
        payload: { ...event.payload, ...change },
      }),
    ).toThrow(BadRequestException);
  });

  it.each([
    { producer: 'other-service' },
    { aggregateType: 'AgencyInvoice' },
    { eventVersion: 2 },
    { eventId: 'bad' },
    { correlationId: 'contains space' },
    { occurredAt: '2026-09-13' },
  ])('rejects incompatible envelopes (%#)', (change) => {
    expect(() =>
      parseAgencyProjectionEvent({ ...profile(), ...change }),
    ).toThrow(BadRequestException);
  });

  it.each([
    ['profile enum', profile, { tier: 'PLATINUM' }],
    ['profile timestamp', profile, { joinedAt: '2026-09-13' }],
    ['profile inconsistent suspension', profile, { suspendReason: 'علت' }],
    ['invoice negative amount', invoice, { amountIrr: '-1' }],
    ['invoice scientific amount', invoice, { amountIrr: '1e3' }],
    ['invoice overflow', invoice, { amountIrr: '9223372036854775808' }],
    [
      'invoice due before issue',
      invoice,
      { dueAt: '2026-09-12T08:00:00.000Z' },
    ],
    ['invoice status', invoice, { status: 'CLOSED' }],
    ['credit status', creditRequest, { status: 'DONE' }],
    [
      'credit pending with decision',
      creditRequest,
      {
        decidedById: 'staff-1',
        decidedAt: '2026-09-13T08:30:00.000Z',
      },
    ],
  ] as const)(
    'rejects invalid aggregate payload: %s',
    (_name, factory, change) => {
      const event = factory();
      expect(() =>
        parseAgencyProjectionEvent({
          ...event,
          payload: { ...event.payload, ...change },
        }),
      ).toThrow(BadRequestException);
    },
  );

  it.each([
    { decidedById: null, decidedAt: '2026-09-13T08:30:00.000Z' },
    { decidedById: 'staff-1', decidedAt: null },
    {
      decidedById: 'staff-1',
      decidedAt: '2026-09-13T07:59:59.999Z',
    },
  ])('rejects an incomplete or stale credit decision (%#)', (change) => {
    const event = creditRequest();
    expect(() =>
      parseAgencyProjectionEvent({
        ...event,
        payload: { ...event.payload, status: 'APPROVED', ...change },
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts a complete approved credit decision', () => {
    const event = creditRequest();
    expect(
      parseAgencyProjectionEvent({
        ...event,
        payload: {
          ...event.payload,
          status: 'APPROVED',
          decidedById: 'staff-1',
          decidedAt: '2026-09-13T08:30:00.000Z',
        },
      }).payload,
    ).toMatchObject({ status: 'APPROVED', decidedById: 'staff-1' });
  });

  it('rejects event types outside the Agency contract', () => {
    const event: CanonicalEvent = {
      ...profile(),
      eventType: 'CartableTaskProjected',
    };
    expect(() => parseAgencyProjectionEvent(event)).toThrow(
      BadRequestException,
    );
  });

  it('does not expose protected profile data in validation errors', () => {
    const event = profile();
    try {
      parseAgencyProjectionEvent({
        ...event,
        payload: { ...event.payload, phone: '' },
      });
      throw new Error('Expected validation failure');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        code: 'VALIDATION_FAILED',
        message: 'قرارداد رویداد آژانس معتبر نیست.',
      });
      expect(
        JSON.stringify((error as BadRequestException).getResponse()),
      ).not.toContain(event.payload.email);
    }
  });

  it('rejects invalid Date instances before building an event', () => {
    expect(() =>
      createAgencyProfileProjected(
        {
          userId: 'agency-1',
          licenseNo: 'LICENSE-1',
          managerName: 'مدیر نمونه',
          phone: '09121234567',
          email: 'agency@example.test',
          city: 'تهران',
          address: 'نشانی نمونه',
          tier: 'GOLD',
          suspendedAt: null,
          suspendReason: null,
          joinedAt: new Date(Number.NaN),
        },
        context(),
      ),
    ).toThrow(BadRequestException);
  });
});
