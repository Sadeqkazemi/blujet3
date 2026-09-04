import { pctOfIrr, subIrr } from '../../common/money';
import type { Irr } from '../../common/money';

export interface PenaltyRule {
  minHoursBeforeDeparture: number;
  penaltyPct: number;
  labelFa: string;
}

export interface PenaltyResult {
  penaltyPct: number;
  penaltyAmountIrr: Irr;
  refundableIrr: Irr;
  ruleLabelFa: string;
}

export const BLUJET_PURCHASE_GRACE_HOURS = 24;
export const BLUJET_MIN_REFUND_HOURS = 12;

export function selectPenaltyRule<T extends PenaltyRule>(
  rules: T[],
  hoursLeft: number,
  purchaseAgeHours = Number.POSITIVE_INFINITY,
): T {
  const sorted = [...rules].sort(
    (a, b) => b.minHoursBeforeDeparture - a.minHoursBeforeDeparture,
  );
  if (sorted.length === 0) {
    throw new Error('Refund penalty rules are not configured');
  }

  if (
    hoursLeft >= BLUJET_MIN_REFUND_HOURS &&
    purchaseAgeHours <= BLUJET_PURCHASE_GRACE_HOURS
  ) {
    return sorted[0];
  }

  return (
    sorted.find((r, index) =>
      index === 0
        ? hoursLeft > r.minHoursBeforeDeparture
        : hoursLeft >= r.minHoursBeforeDeparture,
    ) ?? sorted[sorted.length - 1]
  );
}

/**
 * Pure fare-rule penalty computation (design's 4-bracket engine, seeded in
 * RefundPenaltyRule): the highest bracket is strictly above its 72-hour
 * threshold, while every lower bracket includes its lower boundary. This
 * keeps the approved ranges contiguous: >72h, 24–72h, 12–<24h and <12h.
 * RefundPenaltyRule.penaltyPct stays a plain Int percent (not a money column); the amount it's applied to is Irr, so
 * the actual money arithmetic goes through the shared pctOfIrr/subIrr
 * helpers — never a float.
 */
export function computePenalty(
  rules: PenaltyRule[],
  hoursLeft: number,
  totalPaidIrr: Irr,
  purchaseAgeHours = Number.POSITIVE_INFINITY,
): PenaltyResult {
  const rule = selectPenaltyRule(rules, hoursLeft, purchaseAgeHours);

  const penaltyAmountIrr = pctOfIrr(totalPaidIrr, rule.penaltyPct);
  return {
    penaltyPct: rule.penaltyPct,
    penaltyAmountIrr,
    refundableIrr: subIrr(totalPaidIrr, penaltyAmountIrr),
    ruleLabelFa: rule.labelFa,
  };
}
