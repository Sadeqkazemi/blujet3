import {
  basisPointsOfIrr,
  calculateChargesForCabin,
  computeChargeAmount,
  ruleAppliesToCabin,
  ruleEffectiveOn,
} from './charge-rules';
import type { FlightChargeRule } from '../../database/entities/flight-charge-rule.entity';

function rule(
  over: Partial<FlightChargeRule> &
    Pick<FlightChargeRule, 'title' | 'calculationMode'>,
): FlightChargeRule {
  return {
    id: 'r1',
    flightInstanceId: 'fi',
    kind: 'TAX',
    fixedAmountIrr: null,
    percentageBasisPoints: null,
    cabin: null,
    effectiveFrom: null,
    effectiveTo: null,
    isActive: true,
    isPendingRevision: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as FlightChargeRule;
}

describe('charge-rules', () => {
  it('computes FIXED amounts', () => {
    expect(
      computeChargeAmount(10_000_000n, {
        calculationMode: 'FIXED',
        fixedAmountIrr: 500_000n,
        percentageBasisPoints: null,
      }),
    ).toBe(500_000n);
  });

  it('computes PERCENTAGE via basis points (1000 = 10%)', () => {
    expect(basisPointsOfIrr(10_000_000n, 1000)).toBe(1_000_000n);
    expect(
      computeChargeAmount(10_000_000n, {
        calculationMode: 'PERCENTAGE',
        fixedAmountIrr: null,
        percentageBasisPoints: 1000,
      }),
    ).toBe(1_000_000n);
  });

  it('applies cabin=null to every cabin and cabin-specific only to that cabin', () => {
    const all = rule({
      title: 'عوارض عمومی',
      calculationMode: 'FIXED',
      fixedAmountIrr: 100n,
      cabin: null,
    });
    const biz = rule({
      title: 'مالیات بیزینس',
      calculationMode: 'FIXED',
      fixedAmountIrr: 9_000n,
      cabin: 'BUSINESS',
    });
    expect(ruleAppliesToCabin(all, 'ECONOMY')).toBe(true);
    expect(ruleAppliesToCabin(biz, 'ECONOMY')).toBe(false);
    expect(ruleAppliesToCabin(biz, 'BUSINESS')).toBe(true);

    const economy = calculateChargesForCabin(
      10_000_000n,
      [all, biz],
      'ECONOMY',
      new Date(),
    );
    const business = calculateChargesForCabin(
      10_000_000n,
      [all, biz],
      'BUSINESS',
      new Date(),
    );
    expect(economy.totalChargesIrr).toBe('100');
    expect(business.totalChargesIrr).toBe('9100');
  });

  it('respects effective date window', () => {
    const r = rule({
      title: 'موقت',
      calculationMode: 'FIXED',
      fixedAmountIrr: 1n,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: new Date('2026-01-31T00:00:00.000Z'),
    });
    expect(ruleEffectiveOn(r, new Date('2026-01-15T00:00:00.000Z'))).toBe(true);
    expect(ruleEffectiveOn(r, new Date('2026-02-01T00:00:00.000Z'))).toBe(
      false,
    );
    expect(ruleEffectiveOn({ ...r, isActive: false }, new Date())).toBe(false);
  });

  it('keeps COMFORT independent of ECONOMY in breakdowns', () => {
    const comfortOnly = rule({
      title: 'عوارض کامفورت',
      calculationMode: 'FIXED',
      fixedAmountIrr: 250_000n,
      cabin: 'COMFORT',
    });
    const economy = calculateChargesForCabin(
      10_000_000n,
      [comfortOnly],
      'ECONOMY',
      new Date(),
    );
    const comfort = calculateChargesForCabin(
      10_000_000n,
      [comfortOnly],
      'COMFORT',
      new Date(),
    );
    expect(economy.totalChargesIrr).toBe('0');
    expect(comfort.totalChargesIrr).toBe('250000');
  });
});
