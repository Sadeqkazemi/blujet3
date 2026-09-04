import { calculateCoreItineraryRefundSegment } from './core-itinerary-refund.service';
import type { CoreItineraryFlightCoupon } from '../../database/entities/core-itinerary-flight-coupon.entity';
import type { CoreItinerarySegment } from '../../database/entities/core-itinerary-segment.entity';
import type { RefundPenaltyRule } from '../../database/entities/refund-penalty-rule.entity';

const rules: RefundPenaltyRule[] = [
  { id: 'r30', minHoursBeforeDeparture: 72, penaltyPct: 30, labelFa: '۳۰٪' },
  { id: 'r50', minHoursBeforeDeparture: 24, penaltyPct: 50, labelFa: '۵۰٪' },
  { id: 'r70', minHoursBeforeDeparture: 12, penaltyPct: 70, labelFa: '۷۰٪' },
  { id: 'r100', minHoursBeforeDeparture: 0, penaltyPct: 100, labelFa: '۱۰۰٪' },
] as RefundPenaltyRule[];

function segment(departureAt: string): CoreItinerarySegment {
  return {
    id: 'segment-1',
    sequence: 1,
    departureAt: new Date(departureAt),
    extrasIrr: 100n,
  } as CoreItinerarySegment;
}

function coupon(
  id: string,
  fareIrr: bigint,
  taxIrr: bigint,
): CoreItineraryFlightCoupon {
  return {
    id,
    fareIrr,
    taxIrr,
    segmentId: 'segment-1',
    ticketDocumentId: 'document-1',
    status: 'OPEN',
    servicingStatus: null,
    servicingId: null,
  } as CoreItineraryFlightCoupon;
}

describe('calculateCoreItineraryRefundSegment', () => {
  const now = new Date('2026-09-04T00:00:00.000Z');

  it('uses the highest eligible threshold at an exact boundary', () => {
    const result = calculateCoreItineraryRefundSegment(
      segment('2026-09-07T00:00:00.000Z'),
      [coupon('coupon-1', 10_000n, 1_000n)],
      rules,
      now,
    );
    expect(result.hoursLeft).toBe(72);
    expect(result.penaltyPct).toBe(30);
    expect(result.grossAmountIrr).toBe('11100');
    expect(result.penaltyAmountIrr).toBe('3330');
    expect(result.refundableIrr).toBe('7770');
  });

  it('keeps bigint arithmetic exact for a 50 percent penalty', () => {
    const result = calculateCoreItineraryRefundSegment(
      segment('2026-09-05T00:00:00.000Z'),
      [coupon('coupon-1', 9_999n, 1n)],
      rules,
      now,
    );
    expect(result.penaltyPct).toBe(50);
    expect(result.grossAmountIrr).toBe('10100');
    expect(result.penaltyAmountIrr).toBe('5050');
    expect(result.refundableIrr).toBe('5050');
  });
});
