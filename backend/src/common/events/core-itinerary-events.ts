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
export type CoreItineraryEvent =
  ItineraryOrderCreatedEvent | ItineraryPaymentConfirmedEvent;
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
function exact(payload: object, keys: string[]): boolean {
  return Object.keys(payload).sort().join(',') === keys.sort().join(',');
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
      !exact(payload, [
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
      ]) ||
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
      !exact(payload, [
        'auditId',
        'orderVersion',
        'currency',
        'confirmationId',
        'status',
        'amountIrr',
      ]) ||
      !identifier(payload.confirmationId) ||
      payload.status !== 'COMPLETED' ||
      !amount(payload.amountIrr) ||
      toIrr(payload.amountIrr) <= 0n
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
