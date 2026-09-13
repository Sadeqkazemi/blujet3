import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../common/errors';
import {
  AgencyCreditRequestStatus,
  AgencyInvoiceStatus,
  AgencyTier,
  type AgencyCreditRequestStatus as AgencyCreditRequestStatusValue,
  type AgencyInvoiceStatus as AgencyInvoiceStatusValue,
  type AgencyTier as AgencyTierValue,
} from '../database/agency.enums';

export type AgencyEventType =
  | 'AgencyProfileProjected'
  | 'AgencyInvoiceProjected'
  | 'AgencyCreditRequestProjected';

export type AgencyAggregateType =
  'AgencyProfile' | 'AgencyInvoice' | 'AgencyCreditRequest';

interface PayloadBase {
  auditId: string;
  recordVersion: number;
}

export interface AgencyProfilePayload extends PayloadBase {
  licenseNo: string;
  managerName: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  tier: AgencyTierValue;
  suspendedAt: string | null;
  suspendReason: string | null;
  joinedAt: string;
}

export interface AgencyInvoicePayload extends PayloadBase {
  agencyId: string;
  invoiceNo: string;
  issuedById: string;
  issuedAt: string;
  dueAt: string;
  amountIrr: string;
  status: AgencyInvoiceStatusValue;
  paidAt: string | null;
  descriptionFa: string | null;
  bookingId: string | null;
}

export interface AgencyCreditRequestPayload extends PayloadBase {
  agencyId: string;
  requestedLimitIrr: string;
  note: string | null;
  status: AgencyCreditRequestStatusValue;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
}

interface Event<TPayload, TEvent, TAggregate> {
  eventId: string;
  eventType: TEvent;
  eventVersion: 1;
  occurredAt: string;
  producer: 'core-agency';
  aggregateType: TAggregate;
  aggregateId: string;
  correlationId: string;
  idempotencyKey: string;
  payload: TPayload;
}

export type AgencyProfileProjectedEvent = Event<
  AgencyProfilePayload,
  'AgencyProfileProjected',
  'AgencyProfile'
>;
export type AgencyInvoiceProjectedEvent = Event<
  AgencyInvoicePayload,
  'AgencyInvoiceProjected',
  'AgencyInvoice'
>;
export type AgencyCreditRequestProjectedEvent = Event<
  AgencyCreditRequestPayload,
  'AgencyCreditRequestProjected',
  'AgencyCreditRequest'
>;

export type AgencyProjectionEvent =
  | AgencyProfileProjectedEvent
  | AgencyInvoiceProjectedEvent
  | AgencyCreditRequestProjectedEvent;

const ENVELOPE_FIELDS = [
  'aggregateId',
  'aggregateType',
  'correlationId',
  'eventId',
  'eventType',
  'eventVersion',
  'idempotencyKey',
  'occurredAt',
  'payload',
  'producer',
] as const;

const PAYLOAD_FIELDS: Record<AgencyEventType, readonly string[]> = {
  AgencyProfileProjected: [
    'auditId',
    'recordVersion',
    'licenseNo',
    'managerName',
    'phone',
    'email',
    'city',
    'address',
    'tier',
    'suspendedAt',
    'suspendReason',
    'joinedAt',
  ],
  AgencyInvoiceProjected: [
    'auditId',
    'recordVersion',
    'agencyId',
    'invoiceNo',
    'issuedById',
    'issuedAt',
    'dueAt',
    'amountIrr',
    'status',
    'paidAt',
    'descriptionFa',
    'bookingId',
  ],
  AgencyCreditRequestProjected: [
    'auditId',
    'recordVersion',
    'agencyId',
    'requestedLimitIrr',
    'note',
    'status',
    'decidedById',
    'decidedAt',
    'createdAt',
  ],
};

function invalid(): never {
  throw new BadRequestException({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'قرارداد رویداد آژانس معتبر نیست.',
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exact(value: Record<string, unknown>, fields: readonly string[]) {
  return Object.keys(value).sort().join(',') === [...fields].sort().join(',');
}

function eventId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096;
}

function boundedText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096;
}

function nullableText(value: unknown): value is string | null {
  return value === null || boundedText(value);
}

function utc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function nullableUtc(value: unknown): value is string | null {
  return value === null || utc(value);
}

function positiveVersion(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 2_147_483_647
  );
}

function amount(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(0|[1-9][0-9]{0,18})$/.test(value) &&
    BigInt(value) <= 9_223_372_036_854_775_807n
  );
}

function enumValue<T extends string>(
  values: Readonly<Record<string, T>>,
  value: unknown,
): value is T {
  return (
    typeof value === 'string' && Object.values(values).includes(value as T)
  );
}

function json(value: unknown, depth = 0): boolean {
  if (depth > 16) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 256 * 1024;
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (Array.isArray(value))
    return value.length <= 1000 && value.every((item) => json(item, depth + 1));
  if (!record(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 1000 &&
    entries.every(([key, item]) => key.length <= 256 && json(item, depth + 1))
  );
}

function common(input: unknown): {
  event: Record<string, unknown>;
  eventType: AgencyEventType;
  payload: Record<string, unknown>;
} {
  if (!record(input) || !exact(input, ENVELOPE_FIELDS)) invalid();
  const eventType = input.eventType;
  if (
    !eventId(input.eventId) ||
    typeof eventType !== 'string' ||
    !Object.prototype.hasOwnProperty.call(PAYLOAD_FIELDS, eventType) ||
    input.eventVersion !== 1 ||
    !utc(input.occurredAt) ||
    input.producer !== 'core-agency' ||
    !identifier(input.aggregateType) ||
    !identifier(input.aggregateId) ||
    !identifier(input.correlationId) ||
    !identifier(input.idempotencyKey) ||
    !record(input.payload) ||
    !json(input.payload) ||
    Buffer.byteLength(JSON.stringify(input), 'utf8') > 256 * 1024
  )
    invalid();
  const payload = input.payload;
  if (
    !exact(payload, PAYLOAD_FIELDS[eventType as AgencyEventType]) ||
    !identifier(payload.auditId) ||
    !positiveVersion(payload.recordVersion)
  )
    invalid();
  return { event: input, eventType: eventType as AgencyEventType, payload };
}

export function parseAgencyProjectionEvent(
  input: unknown,
): AgencyProjectionEvent {
  const { event, eventType, payload } = common(input);
  switch (eventType) {
    case 'AgencyProfileProjected':
      if (
        event.aggregateType !== 'AgencyProfile' ||
        !text(payload.licenseNo) ||
        !text(payload.managerName) ||
        !text(payload.phone) ||
        !boundedText(payload.email) ||
        !boundedText(payload.city) ||
        !boundedText(payload.address) ||
        !enumValue(AgencyTier, payload.tier) ||
        !nullableUtc(payload.suspendedAt) ||
        !nullableText(payload.suspendReason) ||
        !utc(payload.joinedAt) ||
        (payload.suspendedAt === null && payload.suspendReason !== null)
      )
        invalid();
      break;
    case 'AgencyInvoiceProjected':
      if (
        event.aggregateType !== 'AgencyInvoice' ||
        !identifier(payload.agencyId) ||
        !identifier(payload.invoiceNo) ||
        !identifier(payload.issuedById) ||
        !utc(payload.issuedAt) ||
        !utc(payload.dueAt) ||
        !amount(payload.amountIrr) ||
        !enumValue(AgencyInvoiceStatus, payload.status) ||
        !nullableUtc(payload.paidAt) ||
        !nullableText(payload.descriptionFa) ||
        !(payload.bookingId === null || identifier(payload.bookingId))
      )
        invalid();
      break;
    case 'AgencyCreditRequestProjected': {
      const pending = payload.status === AgencyCreditRequestStatus.PENDING;
      const undecided =
        payload.decidedById === null && payload.decidedAt === null;
      const decided =
        payload.decidedById !== null && payload.decidedAt !== null;
      if (
        event.aggregateType !== 'AgencyCreditRequest' ||
        !identifier(payload.agencyId) ||
        !amount(payload.requestedLimitIrr) ||
        !nullableText(payload.note) ||
        !enumValue(AgencyCreditRequestStatus, payload.status) ||
        !(payload.decidedById === null || identifier(payload.decidedById)) ||
        !nullableUtc(payload.decidedAt) ||
        !utc(payload.createdAt) ||
        (pending ? !undecided : !decided) ||
        (payload.decidedAt !== null &&
          Date.parse(payload.decidedAt) < Date.parse(payload.createdAt))
      )
        invalid();
      break;
    }
  }
  return JSON.parse(JSON.stringify(input)) as AgencyProjectionEvent;
}

export function snapshotPayload(event: AgencyProjectionEvent): object {
  const snapshot: Record<string, unknown> = { ...event.payload };
  delete snapshot.auditId;
  return snapshot;
}
