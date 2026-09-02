import { ConflictException, NotFoundException } from '@nestjs/common';
import type { SelectQueryBuilder } from 'typeorm';
import {
  FlightDefinitionStatus,
  type FlightDefinitionStatus as FlightDefinitionStatusT,
} from '../../database/enums';
import type { FlightInstance } from '../../database/entities/flight-instance.entity';
import { ErrorCode } from '../../common/errors';

/** Customer-facing sellable definition states (live published inventory). */
export const SELLABLE_DEFINITION_STATUSES: FlightDefinitionStatusT[] = [
  FlightDefinitionStatus.PUBLISHED,
  FlightDefinitionStatus.PENDING_REVISION,
];

export function isSellableDefinitionStatus(
  status: FlightDefinitionStatusT | null | undefined,
  hasApprovedSnapshot = false,
): boolean {
  return (
    status === FlightDefinitionStatus.PUBLISHED ||
    // Legacy rows until migration completes / mixed environments
    status === FlightDefinitionStatus.APPROVED ||
    (status === FlightDefinitionStatus.PENDING_REVISION && hasApprovedSnapshot)
  );
}

/** Canonical publish-state names for the API / frontend contract. */
export type PublishStatus =
  'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'REJECTED';

/** FE uiStatus mapping documented in docs/features/flight-approval-workflow.md */
export type FlightUiStatus =
  | 'draft'
  | 'pending_ops'
  | 'ops_rejected'
  | 'pending_ceo'
  | 'registered'
  | 'rejected';

export function toPublishStatus(
  status: FlightDefinitionStatusT | null | undefined,
  _hasApprovedSnapshot = false,
): PublishStatus {
  void _hasApprovedSnapshot;
  switch (status) {
    case FlightDefinitionStatus.PUBLISHED:
    case FlightDefinitionStatus.APPROVED:
      return 'PUBLISHED';
    case FlightDefinitionStatus.REJECTED:
    case FlightDefinitionStatus.OPERATIONS_REJECTED:
      return 'REJECTED';
    case FlightDefinitionStatus.PENDING_CEO:
    case FlightDefinitionStatus.PENDING_REVISION:
    case FlightDefinitionStatus.PENDING_OPERATIONS:
      return 'PENDING_APPROVAL';
    case FlightDefinitionStatus.DRAFT:
    default:
      return 'DRAFT';
  }
}

export function toFlightUiStatus(
  status: FlightDefinitionStatusT | null | undefined,
  _hasApprovedSnapshot = false,
): FlightUiStatus {
  void _hasApprovedSnapshot;
  switch (status) {
    case FlightDefinitionStatus.PUBLISHED:
    case FlightDefinitionStatus.APPROVED:
      return 'registered';
    case FlightDefinitionStatus.PENDING_OPERATIONS:
      return 'pending_ops';
    case FlightDefinitionStatus.OPERATIONS_REJECTED:
      return 'ops_rejected';
    case FlightDefinitionStatus.PENDING_CEO:
    case FlightDefinitionStatus.PENDING_REVISION:
      return 'pending_ceo';
    case FlightDefinitionStatus.REJECTED:
      return 'rejected';
    case FlightDefinitionStatus.DRAFT:
    default:
      return 'draft';
  }
}

/** Restrict a FlightInstance query to sellable definition statuses. */
export function applySellableDefinitionFilter<T extends FlightInstance>(
  qb: SelectQueryBuilder<T>,
  alias = 'fi',
): SelectQueryBuilder<T> {
  return qb.andWhere(
    `(${alias}.definitionStatus IN (:...sellableStatuses) OR (` +
      `${alias}.definitionStatus = :pendingRevisionDefinition AND ` +
      `${alias}.approvedSnapshot IS NOT NULL))`,
    {
      sellableStatuses: [
        FlightDefinitionStatus.PUBLISHED,
        FlightDefinitionStatus.APPROVED,
      ],
      pendingRevisionDefinition: FlightDefinitionStatus.PENDING_REVISION,
    },
  );
}

/**
 * Throws NotFound (same message as missing flight) when the instance is not
 * customer-sellable — avoids leaking draft/pending/rejected inventory.
 */
export function assertSellableForSale(
  instance: Pick<
    FlightInstance,
    'definitionStatus' | 'status' | 'approvedSnapshot'
  > | null,
): asserts instance is NonNullable<typeof instance> {
  if (!instance || instance.status !== 'SCHEDULED') {
    throw new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'پرواز یافت نشد یا دیگر قابل رزرو نیست.',
    });
  }
  if (
    !isSellableDefinitionStatus(
      instance.definitionStatus,
      instance.approvedSnapshot != null,
    )
  ) {
    throw new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'پرواز یافت نشد یا دیگر قابل رزرو نیست.',
    });
  }
}

export function assertSellableOrConflict(
  instance: Pick<FlightInstance, 'definitionStatus' | 'approvedSnapshot'>,
): void {
  if (
    !isSellableDefinitionStatus(
      instance.definitionStatus,
      instance.approvedSnapshot != null,
    )
  ) {
    throw new ConflictException({
      code: ErrorCode.CONFLICT,
      message: 'این پرواز هنوز برای فروش تأیید نشده است.',
    });
  }
}
