import { randomUUID } from 'node:crypto';

export const CanonicalEventType = {
  ORDER_CREATED: 'OrderCreated',
  PAYMENT_CONFIRMED: 'PaymentConfirmed',
  TICKET_ISSUED: 'TicketIssued',
  REFUND_REQUESTED: 'RefundRequested',
  FLIGHT_DISRUPTED: 'FlightDisrupted',
} as const;

export type CanonicalEventType =
  (typeof CanonicalEventType)[keyof typeof CanonicalEventType];

export interface CanonicalEvent<TPayload = unknown> {
  eventId: string;
  eventType: CanonicalEventType;
  eventVersion: 1;
  occurredAt: string;
  producer: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  idempotencyKey: string;
  payload: TPayload;
}

export function createCanonicalEvent<TPayload>(input: {
  eventType: CanonicalEventType;
  producer: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  idempotencyKey: string;
  payload: TPayload;
  occurredAt?: Date;
}): CanonicalEvent<TPayload> {
  return {
    eventId: randomUUID(),
    eventType: input.eventType,
    eventVersion: 1,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    producer: input.producer,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
  };
}

export function isCanonicalEvent(value: unknown): value is CanonicalEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.eventId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      event.eventId,
    ) &&
    typeof event.eventType === 'string' &&
    Object.values(CanonicalEventType).includes(
      event.eventType as CanonicalEventType,
    ) &&
    event.eventVersion === 1 &&
    typeof event.occurredAt === 'string' &&
    !Number.isNaN(Date.parse(event.occurredAt)) &&
    new Date(event.occurredAt).toISOString() === event.occurredAt &&
    typeof event.producer === 'string' &&
    event.producer.length > 0 &&
    typeof event.aggregateType === 'string' &&
    event.aggregateType.length > 0 &&
    typeof event.aggregateId === 'string' &&
    event.aggregateId.length > 0 &&
    typeof event.correlationId === 'string' &&
    event.correlationId.length > 0 &&
    typeof event.idempotencyKey === 'string' &&
    event.idempotencyKey.length > 0 &&
    Object.keys(event).sort().join(',') ===
      'aggregateId,aggregateType,correlationId,eventId,eventType,eventVersion,idempotencyKey,occurredAt,payload,producer' &&
    [
      event.producer,
      event.aggregateType,
      event.aggregateId,
      event.correlationId,
      event.idempotencyKey,
    ].every(
      (v) =>
        typeof v === 'string' &&
        v.trim() === v &&
        v.length <= 256 &&
        !Array.from(v).some((character) => character.charCodeAt(0) < 32),
    ) &&
    event.payload !== null &&
    typeof event.payload === 'object' &&
    !Array.isArray(event.payload) &&
    isJsonPayload(event.payload) &&
    Buffer.byteLength(JSON.stringify(event), 'utf8') <= 256 * 1024
  );
}

function isJsonPayload(value: unknown, depth = 0): boolean {
  if (depth > 16) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 256 * 1024;
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (Array.isArray(value))
    return (
      value.length <= 1000 &&
      value.every((v: unknown) => isJsonPayload(v, depth + 1))
    );
  if (
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 1000 &&
    entries.every(
      ([key, v]) => key.length <= 256 && isJsonPayload(v, depth + 1),
    )
  );
}
