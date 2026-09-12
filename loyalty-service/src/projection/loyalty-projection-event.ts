import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../common/errors';
import {
  CabinClass,
  ClubCardAssignee,
  ClubCardRequestStatus,
  ClubCardStatus,
  ClubPointsEntryType,
  ClubTier,
  CustomerReferralStatus,
  PriceLockStatus,
  type CabinClass as CabinClassValue,
  type ClubCardAssignee as ClubCardAssigneeValue,
  type ClubCardRequestStatus as ClubCardRequestStatusValue,
  type ClubCardStatus as ClubCardStatusValue,
  type ClubPointsEntryType as ClubPointsEntryTypeValue,
  type ClubTier as ClubTierValue,
  type CustomerReferralStatus as CustomerReferralStatusValue,
  type PriceLockStatus as PriceLockStatusValue,
} from '../database/loyalty.enums';

export type LoyaltyEventType =
  | 'LoyaltyMemberProjected'
  | 'LoyaltyPointsEntryProjected'
  | 'LoyaltyCardRequestProjected'
  | 'LoyaltyTierRuleProjected'
  | 'LoyaltyPriceLockProjected'
  | 'LoyaltyReferralProjected';

export type LoyaltyAggregateType =
  | 'LoyaltyMember'
  | 'LoyaltyPointsEntry'
  | 'LoyaltyCardRequest'
  | 'LoyaltyTierRule'
  | 'LoyaltyPriceLock'
  | 'LoyaltyReferral';

interface PayloadBase {
  auditId: string;
  recordVersion: number;
}

export interface MemberPayload extends PayloadBase {
  userId: string | null;
  fullName: string;
  email: string;
  birthDate: string | null;
  nationalIdEnc: string;
  nationalIdHash: string;
  joinDate: string;
  points: number;
  level: ClubTierValue;
  cardStatus: ClubCardStatusValue;
  cardNo: string | null;
  issuedByLabelFa: string | null;
  createdAt: string;
  deactivatedAt: string | null;
  deactivatedById: string | null;
}

export interface PointsEntryPayload extends PayloadBase {
  clubMemberId: string;
  type: ClubPointsEntryTypeValue;
  signedPoints: number;
  bookingId: string | null;
  createdAt: string;
}

export interface CardRequestPayload extends PayloadBase {
  memberId: string;
  level: ClubTierValue;
  points: number;
  status: ClubCardRequestStatusValue;
  assignedTo: ClubCardAssigneeValue | null;
  decidedById: string | null;
  decidedAt: string | null;
  cardNo: string | null;
  history: unknown;
  createdAt: string;
}

export interface TierRulePayload extends PayloadBase {
  goldMinPoints: number;
  platinumMinPoints: number;
  cardRequestMinPoints: number;
  updatedById: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface PriceLockPayload extends PayloadBase {
  userId: string;
  flightInstanceId: string;
  cabin: CabinClassValue;
  lockedPriceIrr: string;
  feeIrr: string;
  feeCharged: boolean;
  status: PriceLockStatusValue;
  expiresAt: string;
  createdAt: string;
  bookingId: string | null;
}

export interface ReferralPayload extends PayloadBase {
  referrerUserId: string;
  referredUserId: string;
  status: CustomerReferralStatusValue;
  pointsAwarded: number;
  firstBookingId: string | null;
  rewardedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Event<TPayload, TEvent, TAggregate> {
  eventId: string;
  eventType: TEvent;
  eventVersion: 1;
  occurredAt: string;
  producer: 'core-loyalty';
  aggregateType: TAggregate;
  aggregateId: string;
  correlationId: string;
  idempotencyKey: string;
  payload: TPayload;
}

export type LoyaltyMemberProjectedEvent = Event<
  MemberPayload,
  'LoyaltyMemberProjected',
  'LoyaltyMember'
>;
export type LoyaltyPointsEntryProjectedEvent = Event<
  PointsEntryPayload,
  'LoyaltyPointsEntryProjected',
  'LoyaltyPointsEntry'
>;
export type LoyaltyCardRequestProjectedEvent = Event<
  CardRequestPayload,
  'LoyaltyCardRequestProjected',
  'LoyaltyCardRequest'
>;
export type LoyaltyTierRuleProjectedEvent = Event<
  TierRulePayload,
  'LoyaltyTierRuleProjected',
  'LoyaltyTierRule'
>;
export type LoyaltyPriceLockProjectedEvent = Event<
  PriceLockPayload,
  'LoyaltyPriceLockProjected',
  'LoyaltyPriceLock'
>;
export type LoyaltyReferralProjectedEvent = Event<
  ReferralPayload,
  'LoyaltyReferralProjected',
  'LoyaltyReferral'
>;

export type LoyaltyProjectionEvent =
  | LoyaltyMemberProjectedEvent
  | LoyaltyPointsEntryProjectedEvent
  | LoyaltyCardRequestProjectedEvent
  | LoyaltyTierRuleProjectedEvent
  | LoyaltyPriceLockProjectedEvent
  | LoyaltyReferralProjectedEvent;

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

const PAYLOAD_FIELDS: Record<LoyaltyEventType, readonly string[]> = {
  LoyaltyMemberProjected: [
    'auditId',
    'recordVersion',
    'userId',
    'fullName',
    'email',
    'birthDate',
    'nationalIdEnc',
    'nationalIdHash',
    'joinDate',
    'points',
    'level',
    'cardStatus',
    'cardNo',
    'issuedByLabelFa',
    'createdAt',
    'deactivatedAt',
    'deactivatedById',
  ],
  LoyaltyPointsEntryProjected: [
    'auditId',
    'recordVersion',
    'clubMemberId',
    'type',
    'signedPoints',
    'bookingId',
    'createdAt',
  ],
  LoyaltyCardRequestProjected: [
    'auditId',
    'recordVersion',
    'memberId',
    'level',
    'points',
    'status',
    'assignedTo',
    'decidedById',
    'decidedAt',
    'cardNo',
    'history',
    'createdAt',
  ],
  LoyaltyTierRuleProjected: [
    'auditId',
    'recordVersion',
    'goldMinPoints',
    'platinumMinPoints',
    'cardRequestMinPoints',
    'updatedById',
    'updatedAt',
    'createdAt',
  ],
  LoyaltyPriceLockProjected: [
    'auditId',
    'recordVersion',
    'userId',
    'flightInstanceId',
    'cabin',
    'lockedPriceIrr',
    'feeIrr',
    'feeCharged',
    'status',
    'expiresAt',
    'createdAt',
    'bookingId',
  ],
  LoyaltyReferralProjected: [
    'auditId',
    'recordVersion',
    'referrerUserId',
    'referredUserId',
    'status',
    'pointsAwarded',
    'firstBookingId',
    'rewardedAt',
    'createdAt',
    'updatedAt',
  ],
};

function invalid(): never {
  throw new BadRequestException({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'قرارداد رویداد باشگاه مشتریان معتبر نیست.',
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, fields: readonly string[]) {
  return Object.keys(value).sort().join(',') === [...fields].sort().join(',');
}

function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

function eventId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function nullableText(value: unknown): value is string | null {
  return value === null || text(value);
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

function int32(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= -2_147_483_648 &&
    value <= 2_147_483_647
  );
}

function nonnegativeInt32(value: unknown): value is number {
  return int32(value) && value >= 0;
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
  eventType: LoyaltyEventType;
  payload: Record<string, unknown>;
} {
  if (!record(input) || !exact(input, ENVELOPE_FIELDS)) invalid();
  const eventType = input.eventType;
  if (
    !eventId(input.eventId) ||
    !text(eventType) ||
    !Object.prototype.hasOwnProperty.call(PAYLOAD_FIELDS, eventType) ||
    input.eventVersion !== 1 ||
    !utc(input.occurredAt) ||
    input.producer !== 'core-loyalty' ||
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
    !exact(payload, PAYLOAD_FIELDS[eventType as LoyaltyEventType]) ||
    !identifier(payload.auditId) ||
    !int32(payload.recordVersion) ||
    payload.recordVersion < 1
  )
    invalid();
  return { event: input, eventType: eventType as LoyaltyEventType, payload };
}

export function parseLoyaltyProjectionEvent(
  input: unknown,
): LoyaltyProjectionEvent {
  const { event, eventType, payload } = common(input);
  switch (eventType) {
    case 'LoyaltyMemberProjected':
      if (
        event.aggregateType !== 'LoyaltyMember' ||
        !(payload.userId === null || identifier(payload.userId)) ||
        !text(payload.fullName) ||
        !text(payload.email) ||
        !nullableUtc(payload.birthDate) ||
        !text(payload.nationalIdEnc) ||
        !text(payload.nationalIdHash) ||
        !utc(payload.joinDate) ||
        !int32(payload.points) ||
        !enumValue(ClubTier, payload.level) ||
        !enumValue(ClubCardStatus, payload.cardStatus) ||
        !nullableText(payload.cardNo) ||
        !nullableText(payload.issuedByLabelFa) ||
        !utc(payload.createdAt) ||
        !nullableUtc(payload.deactivatedAt) ||
        !(
          payload.deactivatedById === null ||
          identifier(payload.deactivatedById)
        )
      )
        invalid();
      break;
    case 'LoyaltyPointsEntryProjected':
      if (
        event.aggregateType !== 'LoyaltyPointsEntry' ||
        payload.recordVersion !== 1 ||
        !identifier(payload.clubMemberId) ||
        !enumValue(ClubPointsEntryType, payload.type) ||
        !int32(payload.signedPoints) ||
        payload.signedPoints === 0 ||
        !(payload.bookingId === null || identifier(payload.bookingId)) ||
        !utc(payload.createdAt)
      )
        invalid();
      break;
    case 'LoyaltyCardRequestProjected':
      if (
        event.aggregateType !== 'LoyaltyCardRequest' ||
        !identifier(payload.memberId) ||
        !enumValue(ClubTier, payload.level) ||
        !int32(payload.points) ||
        !enumValue(ClubCardRequestStatus, payload.status) ||
        !(
          payload.assignedTo === null ||
          enumValue(ClubCardAssignee, payload.assignedTo)
        ) ||
        !(payload.decidedById === null || identifier(payload.decidedById)) ||
        !nullableUtc(payload.decidedAt) ||
        !nullableText(payload.cardNo) ||
        !utc(payload.createdAt)
      )
        invalid();
      break;
    case 'LoyaltyTierRuleProjected':
      if (
        event.aggregateType !== 'LoyaltyTierRule' ||
        !nonnegativeInt32(payload.goldMinPoints) ||
        !nonnegativeInt32(payload.platinumMinPoints) ||
        !nonnegativeInt32(payload.cardRequestMinPoints) ||
        payload.goldMinPoints >= payload.platinumMinPoints ||
        !(payload.updatedById === null || identifier(payload.updatedById)) ||
        !utc(payload.updatedAt) ||
        !utc(payload.createdAt)
      )
        invalid();
      break;
    case 'LoyaltyPriceLockProjected':
      if (
        event.aggregateType !== 'LoyaltyPriceLock' ||
        !identifier(payload.userId) ||
        !identifier(payload.flightInstanceId) ||
        !enumValue(CabinClass, payload.cabin) ||
        !amount(payload.lockedPriceIrr) ||
        !amount(payload.feeIrr) ||
        typeof payload.feeCharged !== 'boolean' ||
        !enumValue(PriceLockStatus, payload.status) ||
        !utc(payload.expiresAt) ||
        !utc(payload.createdAt) ||
        !(payload.bookingId === null || identifier(payload.bookingId))
      )
        invalid();
      break;
    case 'LoyaltyReferralProjected':
      if (
        event.aggregateType !== 'LoyaltyReferral' ||
        !identifier(payload.referrerUserId) ||
        !identifier(payload.referredUserId) ||
        payload.referrerUserId === payload.referredUserId ||
        !enumValue(CustomerReferralStatus, payload.status) ||
        !nonnegativeInt32(payload.pointsAwarded) ||
        !(
          payload.firstBookingId === null || identifier(payload.firstBookingId)
        ) ||
        !nullableUtc(payload.rewardedAt) ||
        !utc(payload.createdAt) ||
        !utc(payload.updatedAt)
      )
        invalid();
      break;
  }
  return JSON.parse(JSON.stringify(input)) as LoyaltyProjectionEvent;
}

export function snapshotPayload(event: LoyaltyProjectionEvent): object {
  const snapshot: Record<string, unknown> = { ...event.payload };
  delete snapshot.auditId;
  return snapshot;
}
