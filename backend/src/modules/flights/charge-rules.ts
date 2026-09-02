import type { EntityManager } from 'typeorm';
import { FlightChargeRule } from '../../database/entities/flight-charge-rule.entity';
import type {
  CabinClass,
  ChargeCalculationMode,
  ChargeKind,
} from '../../database/enums';
import { type Irr, ZERO_IRR, addIrr } from '../../common/money';

export type ChargeRuleWire = {
  id?: string;
  title: string;
  kind: ChargeKind;
  calculationMode: ChargeCalculationMode;
  fixedAmountIrr: string | null;
  percentageBasisPoints: number | null;
  cabin: CabinClass | null;
  /** Wire aliases for frontend (08bb145). */
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
  /** Spec aliases. */
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isActive: boolean;
};

export type ChargeBreakdownLine = {
  title: string;
  kind: ChargeKind;
  amountIrr: string;
  cabin: CabinClass | null;
};

export type CalculatedChargeBreakdown = {
  basePriceIrr: string;
  lines: ChargeBreakdownLine[];
  totalChargesIrr: string;
  totalSellableIrr: string;
};

/** Percentage of amount using basis points (10000 = 100%). Integer math only. */
export function basisPointsOfIrr(amount: Irr, basisPoints: number): Irr {
  if (!Number.isInteger(basisPoints)) {
    throw new Error('percentageBasisPoints must be an integer');
  }
  if (basisPoints < 0) {
    throw new Error('percentageBasisPoints must be non-negative');
  }
  return (amount * BigInt(basisPoints)) / 10_000n;
}

export function serializeChargeRule(rule: FlightChargeRule): ChargeRuleWire {
  const from = rule.effectiveFrom?.toISOString() ?? null;
  const to = rule.effectiveTo?.toISOString() ?? null;
  return {
    id: rule.id,
    title: rule.title,
    kind: rule.kind,
    calculationMode: rule.calculationMode,
    fixedAmountIrr:
      rule.fixedAmountIrr == null ? null : String(rule.fixedAmountIrr),
    percentageBasisPoints: rule.percentageBasisPoints,
    cabin: rule.cabin,
    validFrom: from,
    validUntil: to,
    active: rule.isActive,
    effectiveFrom: from,
    effectiveTo: to,
    isActive: rule.isActive,
  };
}

export function ruleAppliesToCabin(
  rule: Pick<FlightChargeRule, 'cabin'>,
  cabin: CabinClass,
): boolean {
  return rule.cabin == null || rule.cabin === cabin;
}

export function ruleEffectiveOn(
  rule: Pick<FlightChargeRule, 'effectiveFrom' | 'effectiveTo' | 'isActive'>,
  at: Date,
): boolean {
  if (!rule.isActive) return false;
  if (rule.effectiveFrom && rule.effectiveFrom > at) return false;
  if (rule.effectiveTo && rule.effectiveTo < at) return false;
  return true;
}

export function computeChargeAmount(
  basePriceIrr: Irr,
  rule: Pick<
    FlightChargeRule,
    'calculationMode' | 'fixedAmountIrr' | 'percentageBasisPoints'
  >,
): Irr {
  if (rule.calculationMode === 'FIXED') {
    return rule.fixedAmountIrr ?? ZERO_IRR;
  }
  const bp = rule.percentageBasisPoints ?? 0;
  return basisPointsOfIrr(basePriceIrr, bp);
}

export function calculateChargesForCabin(
  basePriceIrr: Irr,
  rules: FlightChargeRule[],
  cabin: CabinClass,
  at: Date,
): CalculatedChargeBreakdown {
  const lines: ChargeBreakdownLine[] = [];
  let totalCharges: Irr = ZERO_IRR;
  for (const rule of rules) {
    if (!ruleAppliesToCabin(rule, cabin)) continue;
    if (!ruleEffectiveOn(rule, at)) continue;
    const amount = computeChargeAmount(basePriceIrr, rule);
    if (amount === ZERO_IRR && rule.calculationMode === 'FIXED') {
      // Still include zero FIXED lines for audit visibility when active.
    }
    lines.push({
      title: rule.title,
      kind: rule.kind,
      amountIrr: String(amount),
      cabin: rule.cabin,
    });
    totalCharges = addIrr(totalCharges, amount);
  }
  return {
    basePriceIrr: String(basePriceIrr),
    lines,
    totalChargesIrr: String(totalCharges),
    totalSellableIrr: String(addIrr(basePriceIrr, totalCharges)),
  };
}

/** Active (non-pending) charge rules for an instance. */
export async function loadActiveChargeRules(
  manager: EntityManager,
  flightInstanceId: string,
): Promise<FlightChargeRule[]> {
  return manager.find(FlightChargeRule, {
    where: {
      flightInstanceId,
      isPendingRevision: false,
    },
    order: { createdAt: 'ASC' },
  });
}

export async function calculateActiveCharges(
  manager: EntityManager,
  flightInstanceId: string,
  basePriceIrr: Irr,
  cabin: CabinClass,
  at: Date,
): Promise<CalculatedChargeBreakdown> {
  const rules = await loadActiveChargeRules(manager, flightInstanceId);
  return calculateChargesForCabin(basePriceIrr, rules, cabin, at);
}
