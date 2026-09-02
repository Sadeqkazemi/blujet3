import { NotFoundException } from '@nestjs/common';
import { FlightDefinitionStatus } from '../../database/enums';
import {
  assertSellableForSale,
  isSellableDefinitionStatus,
  toFlightUiStatus,
  toPublishStatus,
} from './definition-sellability';

describe('definition-sellability', () => {
  it('treats PUBLISHED as sellable and requires snapshot for PENDING_REVISION', () => {
    expect(isSellableDefinitionStatus(FlightDefinitionStatus.PUBLISHED)).toBe(
      true,
    );
    expect(isSellableDefinitionStatus(FlightDefinitionStatus.APPROVED)).toBe(
      true,
    );
    expect(
      isSellableDefinitionStatus(FlightDefinitionStatus.PENDING_REVISION),
    ).toBe(false);
    expect(
      isSellableDefinitionStatus(FlightDefinitionStatus.PENDING_REVISION, true),
    ).toBe(true);
    expect(isSellableDefinitionStatus(FlightDefinitionStatus.DRAFT)).toBe(
      false,
    );
    expect(
      isSellableDefinitionStatus(FlightDefinitionStatus.PENDING_OPERATIONS),
    ).toBe(false);
  });

  it('maps ui / publish statuses for the ops workflow', () => {
    expect(toFlightUiStatus(FlightDefinitionStatus.PENDING_OPERATIONS)).toBe(
      'pending_ops',
    );
    expect(toFlightUiStatus(FlightDefinitionStatus.OPERATIONS_REJECTED)).toBe(
      'ops_rejected',
    );
    expect(toFlightUiStatus(FlightDefinitionStatus.PUBLISHED)).toBe(
      'registered',
    );
    expect(toPublishStatus(FlightDefinitionStatus.PUBLISHED)).toBe('PUBLISHED');
    expect(toPublishStatus(FlightDefinitionStatus.PENDING_OPERATIONS)).toBe(
      'PENDING_APPROVAL',
    );
  });

  it('assertSellableForSale rejects draft definitions', () => {
    expect(() =>
      assertSellableForSale({
        status: 'SCHEDULED',
        definitionStatus: FlightDefinitionStatus.DRAFT,
        approvedSnapshot: null,
      }),
    ).toThrow(NotFoundException);
  });

  it('assertSellableForSale accepts published scheduled instances', () => {
    expect(() =>
      assertSellableForSale({
        status: 'SCHEDULED',
        definitionStatus: FlightDefinitionStatus.PUBLISHED,
        approvedSnapshot: null,
      }),
    ).not.toThrow();
  });

  it('rejects a pending revision without a live approved snapshot', () => {
    expect(() =>
      assertSellableForSale({
        status: 'SCHEDULED',
        definitionStatus: FlightDefinitionStatus.PENDING_REVISION,
        approvedSnapshot: null,
      }),
    ).toThrow(NotFoundException);
  });
});
