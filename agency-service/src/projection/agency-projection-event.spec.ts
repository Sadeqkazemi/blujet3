import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { parseAgencyProjectionEvent } from './agency-projection-event';

const at = '2026-09-13T10:00:00.000Z';

function profileEvent(): Record<string, unknown> {
  return {
    eventId: randomUUID(),
    eventType: 'AgencyProfileProjected',
    eventVersion: 1,
    occurredAt: at,
    producer: 'core-agency',
    aggregateType: 'AgencyProfile',
    aggregateId: randomUUID(),
    correlationId: randomUUID(),
    idempotencyKey: randomUUID(),
    payload: {
      auditId: randomUUID(),
      recordVersion: 1,
      licenseNo: 'AGENCY-100',
      managerName: 'مدیر آژانس',
      phone: '02100000000',
      email: 'agency@example.invalid',
      city: 'تهران',
      address: 'تهران',
      tier: 'NORMAL',
      suspendedAt: null,
      suspendReason: null,
      joinedAt: at,
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('parseAgencyProjectionEvent', () => {
  it('accepts an exact detached v1 snapshot', () => {
    const input = profileEvent();
    const parsed = parseAgencyProjectionEvent(input);

    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
  });

  it.each([
    [
      'unknown envelope field',
      (event: Record<string, unknown>) => (event.x = 1),
    ],
    [
      'wrong producer',
      (event: Record<string, unknown>) => (event.producer = 'agency'),
    ],
    [
      'noncanonical timestamp',
      (event: Record<string, unknown>) => (event.occurredAt = '2026-09-13'),
    ],
    [
      'unsafe version',
      (event: Record<string, unknown>) =>
        ((event.payload as Record<string, unknown>).recordVersion = 0),
    ],
    [
      'unknown payload field',
      (event: Record<string, unknown>) =>
        ((event.payload as Record<string, unknown>).secret = 'x'),
    ],
    [
      'invalid enum',
      (event: Record<string, unknown>) =>
        ((event.payload as Record<string, unknown>).tier = 'VIP'),
    ],
    [
      'reason without suspension',
      (event: Record<string, unknown>) =>
        ((event.payload as Record<string, unknown>).suspendReason = 'x'),
    ],
  ])('rejects %s without exposing the payload', (_name, mutate) => {
    const input = clone(profileEvent());
    mutate(input);

    expect(() => parseAgencyProjectionEvent(input)).toThrow(
      BadRequestException,
    );
    try {
      parseAgencyProjectionEvent(input);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('agency@example.invalid');
    }
  });

  it('rejects malformed invoice amounts and inconsistent credit decisions', () => {
    const profile = profileEvent();
    const base = {
      eventId: randomUUID(),
      eventVersion: 1,
      occurredAt: at,
      producer: 'core-agency',
      aggregateId: randomUUID(),
      correlationId: randomUUID(),
      idempotencyKey: randomUUID(),
    };
    const invoice = {
      ...base,
      eventType: 'AgencyInvoiceProjected',
      aggregateType: 'AgencyInvoice',
      payload: {
        auditId: randomUUID(),
        recordVersion: 1,
        agencyId: profile.aggregateId,
        invoiceNo: 'INV-1',
        issuedById: randomUUID(),
        issuedAt: at,
        dueAt: at,
        amountIrr: '1.5',
        status: 'UNPAID',
        paidAt: null,
        descriptionFa: null,
        bookingId: null,
      },
    };
    const credit = {
      ...base,
      eventId: randomUUID(),
      eventType: 'AgencyCreditRequestProjected',
      aggregateType: 'AgencyCreditRequest',
      payload: {
        auditId: randomUUID(),
        recordVersion: 1,
        agencyId: profile.aggregateId,
        requestedLimitIrr: '1000',
        note: null,
        status: 'APPROVED',
        decidedById: null,
        decidedAt: null,
        createdAt: at,
      },
    };

    expect(() => parseAgencyProjectionEvent(invoice)).toThrow(
      BadRequestException,
    );
    expect(() => parseAgencyProjectionEvent(credit)).toThrow(
      BadRequestException,
    );
  });
});
