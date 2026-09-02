import { computePenalty, type PenaltyRule } from './penalty';

const RULES: PenaltyRule[] = [
  {
    minHoursBeforeDeparture: 72,
    penaltyPct: 30,
    labelFa: 'بیش از ۷۲ ساعت مانده به پرواز',
  },
  {
    minHoursBeforeDeparture: 24,
    penaltyPct: 50,
    labelFa: 'بین ۲۴ تا ۷۲ ساعت مانده',
  },
  {
    minHoursBeforeDeparture: 3,
    penaltyPct: 70,
    labelFa: 'بین ۳ تا ۲۴ ساعت مانده',
  },
  {
    minHoursBeforeDeparture: 0,
    penaltyPct: 100,
    labelFa: 'کمتر از ۳ ساعت / پس از پرواز',
  },
];

describe('computePenalty (unit)', () => {
  it.each([
    [100, 30],
    [72, 30], // boundary: exactly 72h keeps the ≥72 bracket
    [71.9, 50],
    [24, 50], // boundary
    [23.9, 70],
    [3, 70], // boundary
    [2.9, 100],
    [0, 100],
  ])('hoursLeft=%p → %p٪', (hoursLeft, expectedPct) => {
    expect(computePenalty(RULES, hoursLeft, 10_000_000n).penaltyPct).toBe(
      expectedPct,
    );
  });

  it('refundable = totalPaid − penalty, integer IRR', () => {
    const r = computePenalty(RULES, 100, 25_000_000n);
    expect(r.penaltyAmountIrr).toBe(7_500_000n);
    expect(r.refundableIrr).toBe(17_500_000n);
    expect(typeof r.penaltyAmountIrr).toBe('bigint');
  });

  it('100٪ bracket leaves nothing refundable (غیرقابل استرداد)', () => {
    const r = computePenalty(RULES, 1, 25_000_000n);
    expect(r.refundableIrr).toBe(0n);
  });

  it('rounds odd percentages to whole rial', () => {
    const r = computePenalty(RULES, 100, 33_333_333n);
    expect(r.penaltyAmountIrr).toBe(10_000_000n);
    expect(r.penaltyAmountIrr + r.refundableIrr).toBe(33_333_333n);
  });
});
