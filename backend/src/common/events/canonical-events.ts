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
    typeof event.eventType === 'string' &&
    Object.values(CanonicalEventType).includes(
      event.eventType as CanonicalEventType,
    ) &&
    event.eventVersion === 1 &&
    typeof event.occurredAt === 'string' &&
    !Number.isNaN(Date.parse(event.occurredAt)) &&
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
    'payload' in event && event.payload !== undefined
  );
}
