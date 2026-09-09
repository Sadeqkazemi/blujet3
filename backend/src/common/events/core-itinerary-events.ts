import { BadRequestException } from '@nestjs/common';
import type { CoreItineraryOrder } from '../../database/entities/core-itinerary-order.entity';
import type { CoreItineraryPaymentConfirmation } from '../../database/entities/core-itinerary-payment-confirmation.entity';
import { ErrorCode } from '../errors';
import { addIrr, toIrr } from '../money';
import {
  createCanonicalEvent,
  isCanonicalEvent,
  type CanonicalEvent,
} from './canonical-events';
import { CoreItineraryEventSchemaCatalog } from './core-itinerary-event-schema';

interface ItineraryEventBase {
  auditId: string;
  orderVersion: number;
  currency: 'IRR';
}
export interface ItineraryOrderCreatedPayload extends ItineraryEventBase {
  channel: 'SYSTEM' | 'AGENCY';
  status: 'HELD';
  fareIrr: string;
  taxIrr: string;
  extrasIrr: string;
  totalIrr: string;
  holdExpiresAt: string;
}
export interface ItineraryPaymentConfirmedPayload extends ItineraryEventBase {
  confirmationId: string;
  status: 'COMPLETED';
  amountIrr: string;
}
export interface ItineraryTicketIssuedPayload extends ItineraryEventBase {
  status: 'TICKETED';
  ticketDocumentIds: string[];
  issuedAt: string;
}
export interface ItineraryRefundRequestedPayload extends ItineraryEventBase {
  refundId: string;
  refundReference: string;
  quoteReference: string;
  status: 'RECEIVED';
  grossAmountIrr: string;
  penaltyAmountIrr: string;
  refundableIrr: string;
}
type Envelope<P, T extends CanonicalEvent['eventType']> = CanonicalEvent<P> & {
  eventType: T;
  aggregateType: 'CoreItineraryOrder';
  producer: 'core-commerce';
};
export type ItineraryOrderCreatedEvent = Envelope<
  ItineraryOrderCreatedPayload,
  'OrderCreated'
>;
export type ItineraryPaymentConfirmedEvent = Envelope<
  ItineraryPaymentConfirmedPayload,
  'PaymentConfirmed'
>;
export type ItineraryTicketIssuedEvent = Envelope<
  ItineraryTicketIssuedPayload,
  'TicketIssued'
>;
export type ItineraryRefundRequestedEvent = Envelope<
  ItineraryRefundRequestedPayload,
  'RefundRequested'
>;
export type CoreItineraryEvent =
  | ItineraryOrderCreatedEvent
  | ItineraryPaymentConfirmedEvent
  | ItineraryTicketIssuedEvent
  | ItineraryRefundRequestedEvent;
export interface ItineraryEventContext {
  auditId: string;
  correlationId: string;
  idempotencyKey: string;
}
type OrderSnapshot = Pick<
  CoreItineraryOrder,
  | 'id'
  | 'version'
  | 'status'
  | 'currency'
  | 'channel'
  | 'fareIrr'
  | 'taxIrr'
  | 'extrasIrr'
  | 'totalIrr'
  | 'holdExpiresAt'
  | 'createdAt'
>;
type PaymentOrderSnapshot = Pick<
  CoreItineraryOrder,
  'id' | 'version' | 'status' | 'currency' | 'totalIrr'
>;
type ConfirmationSnapshot = Pick<
  CoreItineraryPaymentConfirmation,
  | 'id'
  | 'orderId'
  | 'status'
  | 'currency'
  | 'amountIrr'
  | 'failureCode'
  | 'updatedAt'
>;
type TicketDocumentSnapshot = Pick<
  import('../../database/entities/core-itinerary-ticket-document.entity').CoreItineraryTicketDocument,
  | 'id'
  | 'orderId'
  | 'status'
  | 'accountabilityStatus'
  | 'issueSource'
  | 'issuedAt'
>;
type RefundSnapshot = Pick<
  import('../../database/entities/core-itinerary-refund.entity').CoreItineraryRefund,
  | 'id'
  | 'orderId'
  | 'status'
  | 'refundReference'
  | 'quoteReference'
  | 'grossAmountIrr'
  | 'penaltyAmountIrr'
  | 'refundableIrr'
  | 'currency'
  | 'createdAt'
>;

function invalid(): never {
  throw new BadRequestException({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'قرارداد رویداد سفر معتبر نیست.',
  });
}
function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}
function amount(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(0|[1-9][0-9]{0,18})$/.test(value) &&
    toIrr(value) <= 9223372036854775807n
  );
}
function utc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
function exact(payload: object, keys: readonly string[]): boolean {
  return Object.keys(payload).sort().join(',') === [...keys].sort().join(',');
}
function date(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return value.toISOString();
}
function money(value: bigint): string {
  if (typeof value !== 'bigint') invalid();
  return value.toString();
}

export function parseCoreItineraryEvent(input: unknown): CoreItineraryEvent {
  if (
    !isCanonicalEvent(input) ||
    input.producer !== 'core-commerce' ||
    input.aggregateType !== 'CoreItineraryOrder' ||
    !identifier(input.aggregateId) ||
    !identifier(input.correlationId) ||
    !identifier(input.idempotencyKey)
  )
    invalid();
  const payload = input.payload as Record<string, unknown>;
  if (
    !identifier(payload.auditId) ||
    payload.currency !== 'IRR' ||
    typeof payload.orderVersion !== 'number' ||
    !Number.isInteger(payload.orderVersion) ||
    payload.orderVersion < 1 ||
    payload.orderVersion > 2147483647
  )
    invalid();
  if (input.eventType === 'OrderCreated') {
    if (
      !exact(
        payload,
        CoreItineraryEventSchemaCatalog.OrderCreated.payloadFields,
      ) ||
      (payload.channel !== 'SYSTEM' && payload.channel !== 'AGENCY') ||
      payload.status !== 'HELD' ||
      !amount(payload.fareIrr) ||
      !amount(payload.taxIrr) ||
      !amount(payload.extrasIrr) ||
      !amount(payload.totalIrr) ||
      !utc(payload.holdExpiresAt) ||
      Date.parse(payload.holdExpiresAt) <= Date.parse(input.occurredAt) ||
      addIrr(
        toIrr(payload.fareIrr),
        toIrr(payload.taxIrr),
        toIrr(payload.extrasIrr),
      ) !== toIrr(payload.totalIrr)
    )
      invalid();
  } else if (input.eventType === 'PaymentConfirmed') {
    if (
      !exact(
        payload,
        CoreItineraryEventSchemaCatalog.PaymentConfirmed.payloadFields,
      ) ||
      !identifier(payload.confirmationId) ||
      payload.status !== 'COMPLETED' ||
      !amount(payload.amountIrr) ||
      toIrr(payload.amountIrr) <= 0n
    )
      invalid();
  } else if (input.eventType === 'TicketIssued') {
    if (
      !exact(
        payload,
        CoreItineraryEventSchemaCatalog.TicketIssued.payloadFields,
      ) ||
      payload.status !== 'TICKETED' ||
      !Array.isArray(payload.ticketDocumentIds) ||
      payload.ticketDocumentIds.length < 1 ||
      payload.ticketDocumentIds.length > 1000 ||
      new Set(payload.ticketDocumentIds).size !==
        payload.ticketDocumentIds.length ||
      !payload.ticketDocumentIds.every(identifier) ||
      !utc(payload.issuedAt)
    )
      invalid();
  } else if (input.eventType === 'RefundRequested') {
    if (
      !exact(
        payload,
        CoreItineraryEventSchemaCatalog.RefundRequested.payloadFields,
      ) ||
      !identifier(payload.refundId) ||
      !identifier(payload.refundReference) ||
      !identifier(payload.quoteReference) ||
      payload.status !== 'RECEIVED' ||
      !amount(payload.grossAmountIrr) ||
      !amount(payload.penaltyAmountIrr) ||
      !amount(payload.refundableIrr) ||
      toIrr(payload.grossAmountIrr) <= 0n ||
      toIrr(payload.refundableIrr) <= 0n ||
      addIrr(toIrr(payload.penaltyAmountIrr), toIrr(payload.refundableIrr)) !==
        toIrr(payload.grossAmountIrr)
    )
      invalid();
  } else invalid();
  // Validation above establishes the discriminated payload; detach caller-owned data.
  return JSON.parse(JSON.stringify(input)) as CoreItineraryEvent;
}

export function createItineraryOrderCreated(
  order: OrderSnapshot,
  context: ItineraryEventContext,
): ItineraryOrderCreatedEvent {
  const event = createCanonicalEvent({
    eventType: 'OrderCreated',
    producer: 'core-commerce',
    aggregateType: 'CoreItineraryOrder',
    aggregateId: order.id,
    correlationId: context.correlationId,
    idempotencyKey: context.idempotencyKey,
    occurredAt: new Date(date(order.createdAt)),
    payload: {
      auditId: context.auditId,
      orderVersion: order.version,
      currency: order.currency,
      channel: order.channel,
      status: order.status,
      fareIrr: money(order.fareIrr),
      taxIrr: money(order.taxIrr),
      extrasIrr: money(order.extrasIrr),
      totalIrr: money(order.totalIrr),
      holdExpiresAt: date(order.holdExpiresAt),
    },
  });
  const parsed = parseCoreItineraryEvent(event);
  if (parsed.eventType !== 'OrderCreated') invalid();
  return parsed;
}

export function createItineraryPaymentConfirmed(
  order: PaymentOrderSnapshot,
  confirmation: ConfirmationSnapshot,
  context: ItineraryEventContext,
): ItineraryPaymentConfirmedEvent {
  if (
    order.status !== 'TICKETED' ||
    confirmation.status !== 'COMPLETED' ||
    confirmation.orderId !== order.id ||
    confirmation.failureCode !== null ||
    order.currency !== 'IRR' ||
    confirmation.currency !== order.currency ||
    typeof order.totalIrr !== 'bigint' ||
    order.totalIrr !== confirmation.amountIrr
  )
    invalid();
  const event = createCanonicalEvent({
    eventType: 'PaymentConfirmed',
    producer: 'core-commerce',
    aggregateType: 'CoreItineraryOrder',
    aggregateId: order.id,
    correlationId: context.correlationId,
    idempotencyKey: context.idempotencyKey,
    occurredAt: new Date(date(confirmation.updatedAt)),
    payload: {
      auditId: context.auditId,
      orderVersion: order.version,
      currency: confirmation.currency,
      confirmationId: confirmation.id,
      status: confirmation.status,
      amountIrr: money(confirmation.amountIrr),
    },
  });
  const parsed = parseCoreItineraryEvent(event);
  if (parsed.eventType !== 'PaymentConfirmed') invalid();
  return parsed;
}

export function createItineraryTicketIssued(
  order: Pick<CoreItineraryOrder, 'id' | 'version' | 'status' | 'currency'>,
  documents: TicketDocumentSnapshot[],
  context: ItineraryEventContext,
): ItineraryTicketIssuedEvent {
  if (
    order.status !== 'TICKETED' ||
    order.currency !== 'IRR' ||
    documents.length < 1 ||
    documents.some(
      (document) =>
        document.orderId !== order.id ||
        document.status !== 'ISSUED' ||
        document.accountabilityStatus !== 'ACCOUNTABLE' ||
        document.issueSource !== 'CORE_ITINERARY_PAYMENT',
    )
  )
    invalid();
  const issuedAt = new Date(
    Math.max(...documents.map((document) => document.issuedAt.getTime())),
  );
  const event = createCanonicalEvent({
    eventType: 'TicketIssued',
    producer: 'core-commerce',
    aggregateType: 'CoreItineraryOrder',
    aggregateId: order.id,
    correlationId: context.correlationId,
    idempotencyKey: context.idempotencyKey,
    occurredAt: issuedAt,
    payload: {
      auditId: context.auditId,
      orderVersion: order.version,
      currency: order.currency,
      status: order.status,
      ticketDocumentIds: documents.map((document) => document.id),
      issuedAt: date(issuedAt),
    },
  });
  const parsed = parseCoreItineraryEvent(event);
  if (parsed.eventType !== 'TicketIssued') invalid();
  return parsed;
}

export function createItineraryRefundRequested(
  order: Pick<CoreItineraryOrder, 'id' | 'version' | 'status'>,
  refund: RefundSnapshot,
  context: ItineraryEventContext,
): ItineraryRefundRequestedEvent {
  if (
    order.status !== 'TICKETED' ||
    refund.orderId !== order.id ||
    refund.status !== 'RECEIVED' ||
    refund.currency !== 'IRR'
  )
    invalid();
  const event = createCanonicalEvent({
    eventType: 'RefundRequested',
    producer: 'core-commerce',
    aggregateType: 'CoreItineraryOrder',
    aggregateId: order.id,
    correlationId: context.correlationId,
    idempotencyKey: context.idempotencyKey,
    occurredAt: new Date(date(refund.createdAt)),
    payload: {
      auditId: context.auditId,
      orderVersion: order.version,
      currency: refund.currency,
      refundId: refund.id,
      refundReference: refund.refundReference,
      quoteReference: refund.quoteReference,
      status: refund.status,
      grossAmountIrr: money(refund.grossAmountIrr),
      penaltyAmountIrr: money(refund.penaltyAmountIrr),
      refundableIrr: money(refund.refundableIrr),
    },
  });
  const parsed = parseCoreItineraryEvent(event);
  if (parsed.eventType !== 'RefundRequested') invalid();
  return parsed;
}
