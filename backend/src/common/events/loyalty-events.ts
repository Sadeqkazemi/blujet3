import { BadRequestException } from '@nestjs/common';
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
} from '../../database/enums';
import type { ClubCardRequest } from '../../database/entities/club-card-request.entity';
import type { ClubMember } from '../../database/entities/club-member.entity';
import type { ClubPointsEntry } from '../../database/entities/club-points-entry.entity';
import type { ClubTierRule } from '../../database/entities/club-tier-rule.entity';
import type { CustomerReferral } from '../../database/entities/customer-referral.entity';
import type { PriceLock } from '../../database/entities/price-lock.entity';
import type { JsonValue } from '../../database/json-types';
import { ErrorCode } from '../errors';
import {
  createCanonicalEvent,
  isCanonicalEvent,
  type CanonicalEvent,
} from './canonical-events';
import {
  LoyaltyEventSchemaCatalog,
  type LoyaltySchemaEventType,
} from './loyalty-event-schema';

interface LoyaltyPayloadBase {
  auditId: string;
  recordVersion: number;
}

export interface LoyaltyMemberProjectedPayload extends LoyaltyPayloadBase {
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

export interface LoyaltyPointsEntryProjectedPayload extends LoyaltyPayloadBase {
  clubMemberId: string;
  type: ClubPointsEntryTypeValue;
  signedPoints: number;
  bookingId: string | null;
  createdAt: string;
}

export interface LoyaltyCardRequestProjectedPayload extends LoyaltyPayloadBase {
  memberId: string;
  level: ClubTierValue;
  points: number;
  status: ClubCardRequestStatusValue;
  assignedTo: ClubCardAssigneeValue | null;
  decidedById: string | null;
  decidedAt: string | null;
  cardNo: string | null;
  history: JsonValue;
  createdAt: string;
}

export interface LoyaltyTierRuleProjectedPayload extends LoyaltyPayloadBase {
  goldMinPoints: number;
  platinumMinPoints: number;
  cardRequestMinPoints: number;
  updatedById: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface LoyaltyPriceLockProjectedPayload extends LoyaltyPayloadBase {
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

export interface LoyaltyReferralProjectedPayload extends LoyaltyPayloadBase {
  referrerUserId: string;
  referredUserId: string;
  status: CustomerReferralStatusValue;
  pointsAwarded: number;
  firstBookingId: string | null;
  rewardedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type Envelope<
  TPayload,
  TEvent extends LoyaltySchemaEventType,
  TAggregate extends string,
> = CanonicalEvent<TPayload> & {
  eventType: TEvent;
  producer: 'core-loyalty';
  aggregateType: TAggregate;
};

export type LoyaltyMemberProjectedEvent = Envelope<
  LoyaltyMemberProjectedPayload,
  'LoyaltyMemberProjected',
  'LoyaltyMember'
>;
export type LoyaltyPointsEntryProjectedEvent = Envelope<
  LoyaltyPointsEntryProjectedPayload,
  'LoyaltyPointsEntryProjected',
  'LoyaltyPointsEntry'
>;
export type LoyaltyCardRequestProjectedEvent = Envelope<
  LoyaltyCardRequestProjectedPayload,
  'LoyaltyCardRequestProjected',
  'LoyaltyCardRequest'
>;
export type LoyaltyTierRuleProjectedEvent = Envelope<
  LoyaltyTierRuleProjectedPayload,
  'LoyaltyTierRuleProjected',
  'LoyaltyTierRule'
>;
export type LoyaltyPriceLockProjectedEvent = Envelope<
  LoyaltyPriceLockProjectedPayload,
  'LoyaltyPriceLockProjected',
  'LoyaltyPriceLock'
>;
export type LoyaltyReferralProjectedEvent = Envelope<
  LoyaltyReferralProjectedPayload,
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

export interface LoyaltyProjectionEventContext {
  auditId: string;
  correlationId: string;
  idempotencyKey: string;
  occurredAt: Date;
  recordVersion: number;
}

type MemberSnapshot = Pick<
  ClubMember,
  | 'id'
  | 'userId'
  | 'fullName'
  | 'email'
  | 'birthDate'
  | 'nationalIdEnc'
  | 'nationalIdHash'
  | 'joinDate'
  | 'points'
  | 'level'
  | 'cardStatus'
  | 'cardNo'
  | 'issuedByLabelFa'
  | 'createdAt'
  | 'deactivatedAt'
  | 'deactivatedById'
>;
type PointsEntrySnapshot = Pick<
  ClubPointsEntry,
  'id' | 'clubMemberId' | 'type' | 'signedPoints' | 'bookingId' | 'createdAt'
>;
type CardRequestSnapshot = Pick<
  ClubCardRequest,
  | 'id'
  | 'memberId'
  | 'level'
  | 'points'
  | 'status'
  | 'assignedTo'
  | 'decidedById'
  | 'decidedAt'
  | 'cardNo'
  | 'history'
  | 'createdAt'
>;
type TierRuleSnapshot = Pick<
  ClubTierRule,
  | 'id'
  | 'goldMinPoints'
  | 'platinumMinPoints'
  | 'cardRequestMinPoints'
  | 'updatedById'
  | 'updatedAt'
  | 'createdAt'
>;
type PriceLockSnapshot = Pick<
  PriceLock,
  | 'id'
  | 'userId'
  | 'flightInstanceId'
  | 'cabin'
  | 'lockedPriceIrr'
  | 'feeIrr'
  | 'feeCharged'
  | 'status'
  | 'expiresAt'
  | 'createdAt'
  | 'bookingId'
>;
type ReferralSnapshot = Pick<
  CustomerReferral,
  | 'id'
  | 'referrerUserId'
  | 'referredUserId'
  | 'status'
  | 'pointsAwarded'
  | 'firstBookingId'
  | 'rewardedAt'
  | 'createdAt'
  | 'updatedAt'
>;

function invalid(): never {
  throw new BadRequestException({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'قرارداد رویداد باشگاه مشتریان معتبر نیست.',
  });
}

function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
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
    input.producer !== 'core-loyalty' ||
    !identifier(input.aggregateId) ||
    !identifier(input.correlationId) ||
    !identifier(input.idempotencyKey)
  )
    invalid();
  const payload = input.payload as Record<string, unknown>;
  if (
    !identifier(payload.auditId) ||
    !int32(payload.recordVersion) ||
    payload.recordVersion < 1
  )
    invalid();
  return { event: input, payload };
}

export function parseLoyaltyProjectionEvent(
  input: unknown,
): LoyaltyProjectionEvent {
  const { event, payload } = common(input);
  switch (event.eventType) {
    case 'LoyaltyMemberProjected':
      if (
        event.aggregateType !== 'LoyaltyMember' ||
        !exact(
          payload,
          LoyaltyEventSchemaCatalog.LoyaltyMemberProjected.payloadFields,
        ) ||
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
        !exact(
          payload,
          LoyaltyEventSchemaCatalog.LoyaltyPointsEntryProjected.payloadFields,
        ) ||
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
        !exact(
          payload,
          LoyaltyEventSchemaCatalog.LoyaltyCardRequestProjected.payloadFields,
        ) ||
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
        !exact(
          payload,
          LoyaltyEventSchemaCatalog.LoyaltyTierRuleProjected.payloadFields,
        ) ||
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
        !exact(
          payload,
          LoyaltyEventSchemaCatalog.LoyaltyPriceLockProjected.payloadFields,
        ) ||
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
        !exact(
          payload,
          LoyaltyEventSchemaCatalog.LoyaltyReferralProjected.payloadFields,
        ) ||
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
    default:
      invalid();
  }
  return JSON.parse(JSON.stringify(input)) as LoyaltyProjectionEvent;
}

function create<TPayload>(input: {
  eventType: LoyaltySchemaEventType;
  aggregateType: string;
  aggregateId: string;
  context: LoyaltyProjectionEventContext;
  payload: TPayload;
}): LoyaltyProjectionEvent {
  return parseLoyaltyProjectionEvent(
    createCanonicalEvent({
      eventType: input.eventType,
      producer: 'core-loyalty',
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      correlationId: input.context.correlationId,
      idempotencyKey: input.context.idempotencyKey,
      occurredAt: input.context.occurredAt,
      payload: input.payload,
    }),
  );
}

export function createLoyaltyMemberProjected(
  row: MemberSnapshot,
  context: LoyaltyProjectionEventContext,
): LoyaltyMemberProjectedEvent {
  return create({
    eventType: 'LoyaltyMemberProjected',
    aggregateType: 'LoyaltyMember',
    aggregateId: row.id,
    context,
    payload: {
      auditId: context.auditId,
      recordVersion: context.recordVersion,
      userId: row.userId,
      fullName: row.fullName,
      email: row.email,
      birthDate: nullableDate(row.birthDate),
      nationalIdEnc: row.nationalIdEnc,
      nationalIdHash: row.nationalIdHash,
      joinDate: date(row.joinDate),
      points: row.points,
      level: row.level,
      cardStatus: row.cardStatus,
      cardNo: row.cardNo,
      issuedByLabelFa: row.issuedByLabelFa,
      createdAt: date(row.createdAt),
      deactivatedAt: nullableDate(row.deactivatedAt),
      deactivatedById: row.deactivatedById,
    } satisfies LoyaltyMemberProjectedPayload,
  }) as LoyaltyMemberProjectedEvent;
}

export function createLoyaltyPointsEntryProjected(
  row: PointsEntrySnapshot,
  context: LoyaltyProjectionEventContext,
): LoyaltyPointsEntryProjectedEvent {
  return create({
    eventType: 'LoyaltyPointsEntryProjected',
    aggregateType: 'LoyaltyPointsEntry',
    aggregateId: row.id,
    context,
    payload: {
      auditId: context.auditId,
      recordVersion: context.recordVersion,
      clubMemberId: row.clubMemberId,
      type: row.type,
      signedPoints: row.signedPoints,
      bookingId: row.bookingId,
      createdAt: date(row.createdAt),
    } satisfies LoyaltyPointsEntryProjectedPayload,
  }) as LoyaltyPointsEntryProjectedEvent;
}

export function createLoyaltyCardRequestProjected(
  row: CardRequestSnapshot,
  context: LoyaltyProjectionEventContext,
): LoyaltyCardRequestProjectedEvent {
  return create({
    eventType: 'LoyaltyCardRequestProjected',
    aggregateType: 'LoyaltyCardRequest',
    aggregateId: row.id,
    context,
    payload: {
      auditId: context.auditId,
      recordVersion: context.recordVersion,
      memberId: row.memberId,
      level: row.level,
      points: row.points,
      status: row.status,
      assignedTo: row.assignedTo,
      decidedById: row.decidedById,
      decidedAt: nullableDate(row.decidedAt),
      cardNo: row.cardNo,
      history: row.history,
      createdAt: date(row.createdAt),
    } satisfies LoyaltyCardRequestProjectedPayload,
  }) as LoyaltyCardRequestProjectedEvent;
}

export function createLoyaltyTierRuleProjected(
  row: TierRuleSnapshot,
  context: LoyaltyProjectionEventContext,
): LoyaltyTierRuleProjectedEvent {
  return create({
    eventType: 'LoyaltyTierRuleProjected',
    aggregateType: 'LoyaltyTierRule',
    aggregateId: row.id,
    context,
    payload: {
      auditId: context.auditId,
      recordVersion: context.recordVersion,
      goldMinPoints: row.goldMinPoints,
      platinumMinPoints: row.platinumMinPoints,
      cardRequestMinPoints: row.cardRequestMinPoints,
      updatedById: row.updatedById,
      updatedAt: date(row.updatedAt),
      createdAt: date(row.createdAt),
    } satisfies LoyaltyTierRuleProjectedPayload,
  }) as LoyaltyTierRuleProjectedEvent;
}

export function createLoyaltyPriceLockProjected(
  row: PriceLockSnapshot,
  context: LoyaltyProjectionEventContext,
): LoyaltyPriceLockProjectedEvent {
  return create({
    eventType: 'LoyaltyPriceLockProjected',
    aggregateType: 'LoyaltyPriceLock',
    aggregateId: row.id,
    context,
    payload: {
      auditId: context.auditId,
      recordVersion: context.recordVersion,
      userId: row.userId,
      flightInstanceId: row.flightInstanceId,
      cabin: row.cabin,
      lockedPriceIrr: row.lockedPriceIrr.toString(),
      feeIrr: row.feeIrr.toString(),
      feeCharged: row.feeCharged,
      status: row.status,
      expiresAt: date(row.expiresAt),
      createdAt: date(row.createdAt),
      bookingId: row.bookingId,
    } satisfies LoyaltyPriceLockProjectedPayload,
  }) as LoyaltyPriceLockProjectedEvent;
}

export function createLoyaltyReferralProjected(
  row: ReferralSnapshot,
  context: LoyaltyProjectionEventContext,
): LoyaltyReferralProjectedEvent {
  return create({
    eventType: 'LoyaltyReferralProjected',
    aggregateType: 'LoyaltyReferral',
    aggregateId: row.id,
    context,
    payload: {
      auditId: context.auditId,
      recordVersion: context.recordVersion,
      referrerUserId: row.referrerUserId,
      referredUserId: row.referredUserId,
      status: row.status,
      pointsAwarded: row.pointsAwarded,
      firstBookingId: row.firstBookingId,
      rewardedAt: nullableDate(row.rewardedAt),
      createdAt: date(row.createdAt),
      updatedAt: date(row.updatedAt),
    } satisfies LoyaltyReferralProjectedPayload,
  }) as LoyaltyReferralProjectedEvent;
}
