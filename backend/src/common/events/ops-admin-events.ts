import { BadRequestException } from '@nestjs/common';
import {
  CartableCategory,
  CartableSourceType,
  CartableStatus,
  type CartableCategory as CartableCategoryValue,
  type CartableSourceType as CartableSourceTypeValue,
  type CartableStatus as CartableStatusValue,
} from '../../database/enums';
import { ErrorCode } from '../errors';
import {
  createCanonicalEvent,
  isCanonicalEvent,
  type CanonicalEvent,
} from './canonical-events';
import { OpsAdminEventSchemaCatalog } from './ops-admin-event-schema';

export interface CartableTaskProjectedPayload {
  auditId: string;
  taskVersion: number;
  assigneeId: string;
  category: CartableCategoryValue;
  sourceType: CartableSourceTypeValue | null;
  sourceId: string | null;
  status: CartableStatusValue;
  resolvedAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export type CartableTaskProjectedEvent =
  CanonicalEvent<CartableTaskProjectedPayload> & {
    eventType: 'CartableTaskProjected';
    producer: 'core-ops';
    aggregateType: 'CartableTask';
  };

export interface CartableProjectionEventContext {
  auditId: string;
  correlationId: string;
  idempotencyKey: string;
}

export interface CartableProjectionSnapshot {
  id: string;
  version: number;
  assigneeId: string;
  category: CartableCategoryValue;
  sourceType: CartableSourceTypeValue | null;
  sourceId: string | null;
  status: CartableStatusValue;
  resolvedAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}

function invalid(): never {
  throw new BadRequestException({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'قرارداد رویداد کارتابل معتبر نیست.',
  });
}

function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
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

function exact(payload: object, keys: readonly string[]): boolean {
  return Object.keys(payload).sort().join(',') === [...keys].sort().join(',');
}

function enumValue<T extends string>(
  values: Readonly<Record<string, T>>,
  value: unknown,
): value is T {
  return (
    typeof value === 'string' && Object.values(values).includes(value as T)
  );
}

function date(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return value.toISOString();
}

export function parseCartableTaskProjectedEvent(
  input: unknown,
): CartableTaskProjectedEvent {
  if (
    !isCanonicalEvent(input) ||
    input.eventType !== 'CartableTaskProjected' ||
    input.producer !== 'core-ops' ||
    input.aggregateType !== 'CartableTask' ||
    !identifier(input.aggregateId) ||
    !identifier(input.correlationId) ||
    !identifier(input.idempotencyKey)
  )
    invalid();

  const payload = input.payload as Record<string, unknown>;
  if (
    !exact(
      payload,
      OpsAdminEventSchemaCatalog.CartableTaskProjected.payloadFields,
    ) ||
    !identifier(payload.auditId) ||
    !Number.isInteger(payload.taskVersion) ||
    typeof payload.taskVersion !== 'number' ||
    payload.taskVersion < 1 ||
    payload.taskVersion > 2_147_483_647 ||
    !identifier(payload.assigneeId) ||
    !enumValue(CartableCategory, payload.category) ||
    !(
      payload.sourceType === null ||
      enumValue(CartableSourceType, payload.sourceType)
    ) ||
    !(payload.sourceId === null || identifier(payload.sourceId)) ||
    !enumValue(CartableStatus, payload.status) ||
    !nullableUtc(payload.resolvedAt) ||
    !nullableUtc(payload.readAt) ||
    !utc(payload.createdAt)
  )
    invalid();

  const createdAt = Date.parse(payload.createdAt);
  if (
    (payload.readAt !== null && Date.parse(payload.readAt) < createdAt) ||
    (payload.resolvedAt !== null &&
      Date.parse(payload.resolvedAt) < createdAt) ||
    (payload.status === CartableStatus.OPEN) !== (payload.resolvedAt === null)
  )
    invalid();

  return JSON.parse(JSON.stringify(input)) as CartableTaskProjectedEvent;
}

export function createCartableTaskProjectedEvent(
  task: CartableProjectionSnapshot,
  context: CartableProjectionEventContext,
): CartableTaskProjectedEvent {
  const event = createCanonicalEvent({
    eventType: 'CartableTaskProjected',
    producer: 'core-ops',
    aggregateType: 'CartableTask',
    aggregateId: task.id,
    correlationId: context.correlationId,
    idempotencyKey: context.idempotencyKey,
    occurredAt: task.resolvedAt ?? task.readAt ?? task.createdAt,
    payload: {
      auditId: context.auditId,
      taskVersion: task.version,
      assigneeId: task.assigneeId,
      category: task.category,
      sourceType: task.sourceType,
      sourceId: task.sourceId,
      status: task.status,
      resolvedAt: task.resolvedAt === null ? null : date(task.resolvedAt),
      readAt: task.readAt === null ? null : date(task.readAt),
      createdAt: date(task.createdAt),
    },
  });
  return parseCartableTaskProjectedEvent(event);
}
