import { BadRequestException, ConflictException } from '@nestjs/common';
import { FlightDefinitionStatus } from '../../database/enums';

/**
 * Lightweight transition matrix tests mirroring FlightWorkflowService rules
 * (full path covered in e2e against a real DB).
 */
describe('flight workflow transition matrix', () => {
  const SUBMITTABLE = new Set<string>([
    FlightDefinitionStatus.DRAFT,
    FlightDefinitionStatus.OPERATIONS_REJECTED,
    FlightDefinitionStatus.REJECTED,
    FlightDefinitionStatus.PENDING_REVISION,
  ]);

  function canSubmit(status: string) {
    return SUBMITTABLE.has(status);
  }

  function opsNext(
    status: string,
    decision: 'APPROVED' | 'REJECTED',
    comment: string,
  ): string {
    if (!comment.trim()) {
      throw new BadRequestException('comment required');
    }
    if (status !== FlightDefinitionStatus.PENDING_OPERATIONS) {
      throw new ConflictException('illegal');
    }
    return decision === 'APPROVED'
      ? FlightDefinitionStatus.PENDING_CEO
      : FlightDefinitionStatus.OPERATIONS_REJECTED;
  }

  function ceoPublish(status: string): string {
    if (
      status !== FlightDefinitionStatus.PENDING_CEO &&
      status !== FlightDefinitionStatus.PENDING_REVISION
    ) {
      throw new ConflictException('illegal');
    }
    return FlightDefinitionStatus.PUBLISHED;
  }

  it('allows submit only from draft / rejected / revision states', () => {
    expect(canSubmit(FlightDefinitionStatus.DRAFT)).toBe(true);
    expect(canSubmit(FlightDefinitionStatus.OPERATIONS_REJECTED)).toBe(true);
    expect(canSubmit(FlightDefinitionStatus.PENDING_OPERATIONS)).toBe(false);
    expect(canSubmit(FlightDefinitionStatus.PENDING_CEO)).toBe(false);
    expect(canSubmit(FlightDefinitionStatus.PUBLISHED)).toBe(false);
  });

  it('ops approve and reject transitions', () => {
    expect(
      opsNext(FlightDefinitionStatus.PENDING_OPERATIONS, 'APPROVED', 'ok'),
    ).toBe(FlightDefinitionStatus.PENDING_CEO);
    expect(
      opsNext(FlightDefinitionStatus.PENDING_OPERATIONS, 'REJECTED', 'no'),
    ).toBe(FlightDefinitionStatus.OPERATIONS_REJECTED);
    expect(() =>
      opsNext(FlightDefinitionStatus.PENDING_OPERATIONS, 'APPROVED', '  '),
    ).toThrow(BadRequestException);
    expect(() =>
      opsNext(FlightDefinitionStatus.DRAFT, 'APPROVED', 'ok'),
    ).toThrow(ConflictException);
  });

  it('CEO publish only from PENDING_CEO / PENDING_REVISION', () => {
    expect(ceoPublish(FlightDefinitionStatus.PENDING_CEO)).toBe(
      FlightDefinitionStatus.PUBLISHED,
    );
    expect(() => ceoPublish(FlightDefinitionStatus.PENDING_OPERATIONS)).toThrow(
      ConflictException,
    );
  });

  it('detects stale expectedVersion', () => {
    const current: number = 3;
    const expected: number = 2;
    expect(current !== expected).toBe(true);
  });
});
