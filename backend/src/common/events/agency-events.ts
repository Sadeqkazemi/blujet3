import { BadRequestException } from '@nestjs/common';
import {
  AgencyCreditRequestStatus,
  AgencyInvoiceStatus,
  AgencyTier,
  type AgencyCreditRequestStatus as AgencyCreditRequestStatusValue,
  type AgencyInvoiceStatus as AgencyInvoiceStatusValue,
  type AgencyTier as AgencyTierValue,
} from '../../database/enums';
import type { AgencyCreditRequest } from '../../database/entities/agency-credit-request.entity';
import type { AgencyInvoice } from '../../database/entities/agency-invoice.entity';
import type { AgencyProfile } from '../../database/entities/agency-profile.entity';
import { ErrorCode } from '../errors';
import {
  AgencyEventSchemaCatalog,
  type AgencySchemaEventType,
} from './agency-event-schema';
import {
  createCanonicalEvent,
  isCanonicalEvent,
  type CanonicalEvent,
} from './canonical-events';

interface AgencyPayloadBase {
  auditId: string;
  recordVersion: number;
}

export interface AgencyProfileProjectedPayload extends AgencyPayloadBase {
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

export interface AgencyInvoiceProjectedPayload extends AgencyPayloadBase {
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

export interface AgencyCreditRequestProjectedPayload extends AgencyPayloadBase {
  agencyId: string;
  requestedLimitIrr: string;
  note: string | null;
  status: AgencyCreditRequestStatusValue;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
}

type Envelope<
  TPayload,
  TEvent extends AgencySchemaEventType,
  TAggregate extends string,
> = CanonicalEvent<TPayload> & {
  eventType: TEvent;
  producer: 'core-agency';
  aggregateType: TAggregate;
};

export type AgencyProfileProjectedEvent = Envelope<
  AgencyProfileProjectedPayload,
  'AgencyProfileProjected',
  'AgencyProfile'
>;
export type AgencyInvoiceProjectedEvent = Envelope<
  AgencyInvoiceProjectedPayload,
  'AgencyInvoiceProjected',
  'AgencyInvoice'
>;
export type AgencyCreditRequestProjectedEvent = Envelope<
  AgencyCreditRequestProjectedPayload,
  'AgencyCreditRequestProjected',
  'AgencyCreditRequest'
>;

export type AgencyProjectionEvent =
  | AgencyProfileProjectedEvent
  | AgencyInvoiceProjectedEvent
  | AgencyCreditRequestProjectedEvent;

export interface AgencyProjectionEventContext {
  auditId: string;
  correlationId: string;
  idempotencyKey: string;
  occurredAt: Date;
  recordVersion: number;
}

type ProfileSnapshot = Pick<
  AgencyProfile,
  | 'userId'
  | 'licenseNo'
  | 'managerName'
  | 'phone'
  | 'email'
  | 'city'
  | 'address'
  | 'tier'
  | 'suspendedAt'
  | 'suspendReason'
  | 'joinedAt'
>;
type InvoiceSnapshot = Pick<
  AgencyInvoice,
  | 'id'
  | 'agencyId'
  | 'invoiceNo'
  | 'issuedById'
  | 'issuedAt'
  | 'dueAt'
  | 'amountIrr'
  | 'status'
  | 'paidAt'
  | 'descriptionFa'
  | 'bookingId'
>;
type CreditRequestSnapshot = Pick<
  AgencyCreditRequest,
  | 'id'
  | 'agencyId'
  | 'requestedLimitIrr'
  | 'note'
  | 'status'
  | 'decidedById'
  | 'decidedAt'
  | 'createdAt'
>;

function invalid(): never {
  throw new BadRequestException({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'قرارداد رویداد آژانس معتبر نیست.',
  });
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

function exact(payload: object, keys: readonly string[]): boolean {
  return Object.keys(payload).sort().join(',') === [...keys].sort().join(',');
}

function date(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return value.toISOString();
}

function nullableDate(value: Date | null): string | null {
  return value === null ? null : date(value);
}

function common(input: unknown): {
  event: CanonicalEvent;
  payload: Record<string, unknown>;
} {
  if (
    !isCanonicalEvent(input) ||
    input.producer !== 'core-agency' ||
    !identifier(input.aggregateId) ||
    !identifier(input.correlationId) ||
    !identifier(input.idempotencyKey)
  )
    invalid();
  const payload = input.payload as Record<string, unknown>;
  if (!identifier(payload.auditId) || !positiveVersion(payload.recordVersion))
    invalid();
  return { event: input, payload };
}

export function parseAgencyProjectionEvent(
  input: unknown,
): AgencyProjectionEvent {
  const { event, payload } = common(input);
  switch (event.eventType) {
    case 'AgencyProfileProjected':
      if (
        event.aggregateType !== 'AgencyProfile' ||
        !exact(
          payload,
          AgencyEventSchemaCatalog.AgencyProfileProjected.payloadFields,
        ) ||
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
        !exact(
          payload,
          AgencyEventSchemaCatalog.AgencyInvoiceProjected.payloadFields,
        ) ||
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
        !exact(
          payload,
          AgencyEventSchemaCatalog.AgencyCreditRequestProjected.payloadFields,
        ) ||
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
    default:
      invalid();
  }
  return JSON.parse(JSON.stringify(input)) as AgencyProjectionEvent;
}

function create<TPayload>(input: {
  eventType: AgencySchemaEventType;
  aggregateType: string;
  aggregateId: string;
  context: AgencyProjectionEventContext;
  payload: TPayload;
}): AgencyProjectionEvent {
  return parseAgencyProjectionEvent(
    createCanonicalEvent({
      eventType: input.eventType,
      producer: 'core-agency',
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      correlationId: input.context.correlationId,
      idempotencyKey: input.context.idempotencyKey,
      occurredAt: input.context.occurredAt,
      payload: input.payload,
    }),
  );
}

export function createAgencyProfileProjected(
  row: ProfileSnapshot,
  context: AgencyProjectionEventContext,
): AgencyProfileProjectedEvent {
  return create({
    eventType: 'AgencyProfileProjected',
    aggregateType: 'AgencyProfile',
    aggregateId: row.userId,
    context,
    payload: {
      auditId: context.auditId,
      recordVersion: context.recordVersion,
      licenseNo: row.licenseNo,
      managerName: row.managerName,
      phone: row.phone,
      email: row.email,
      city: row.city,
      address: row.address,
      tier: row.tier,
      suspendedAt: nullableDate(row.suspendedAt),
      suspendReason: row.suspendReason,
      joinedAt: date(row.joinedAt),
    } satisfies AgencyProfileProjectedPayload,
  }) as AgencyProfileProjectedEvent;
}

export function createAgencyInvoiceProjected(
  row: InvoiceSnapshot,
  context: AgencyProjectionEventContext,
): AgencyInvoiceProjectedEvent {
  return create({
    eventType: 'AgencyInvoiceProjected',
    aggregateType: 'AgencyInvoice',
    aggregateId: row.id,
    context,
    payload: {
      auditId: context.auditId,
      recordVersion: context.recordVersion,
      agencyId: row.agencyId,
      invoiceNo: row.invoiceNo,
      issuedById: row.issuedById,
      issuedAt: date(row.issuedAt),
      dueAt: date(row.dueAt),
      amountIrr: row.amountIrr.toString(),
      status: row.status,
      paidAt: nullableDate(row.paidAt),
      descriptionFa: row.descriptionFa,
      bookingId: row.bookingId,
    } satisfies AgencyInvoiceProjectedPayload,
  }) as AgencyInvoiceProjectedEvent;
}

export function createAgencyCreditRequestProjected(
  row: CreditRequestSnapshot,
  context: AgencyProjectionEventContext,
): AgencyCreditRequestProjectedEvent {
  return create({
    eventType: 'AgencyCreditRequestProjected',
    aggregateType: 'AgencyCreditRequest',
    aggregateId: row.id,
    context,
    payload: {
      auditId: context.auditId,
      recordVersion: context.recordVersion,
      agencyId: row.agencyId,
      requestedLimitIrr: row.requestedLimitIrr.toString(),
      note: row.note,
      status: row.status,
      decidedById: row.decidedById,
      decidedAt: nullableDate(row.decidedAt),
      createdAt: date(row.createdAt),
    } satisfies AgencyCreditRequestProjectedPayload,
  }) as AgencyCreditRequestProjectedEvent;
}
