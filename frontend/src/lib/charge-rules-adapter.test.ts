import { describe, expect, it } from 'vitest';
import {
  chargeRuleFromApi,
  draftRuleToApi,
  draftRulesForPreview,
  type DraftChargeRule,
} from './charge-rules-adapter';
import { previewChargeTotalIrr } from './flight-definition';

describe('charge-rules-adapter', () => {
  it('maps FIXED form rules to calculationMode FIXED + fixedAmountIrr string', () => {
    const draft: DraftChargeRule = {
      key: '1',
      title: 'مالیات فرودگاهی',
      kind: 'TAX',
      method: 'FIXED',
      amountInput: '۱۰٬۰۰۰',
      cabin: 'ALL',
      validFromIso: null,
      validUntilIso: null,
      active: true,
    };
    const api = draftRuleToApi(draft);
    expect(api).toMatchObject({
      calculationMode: 'FIXED',
      fixedAmountIrr: '100000',
      percentageBasisPoints: null,
      cabin: null,
    });
  });

  it('maps PERCENT form rules to PERCENTAGE + basis points', () => {
    const draft: DraftChargeRule = {
      key: '2',
      title: 'عوارض',
      kind: 'FEE',
      method: 'PERCENT',
      amountInput: '10',
      cabin: 'BUSINESS',
      validFromIso: null,
      validUntilIso: null,
      active: true,
    };
    const api = draftRuleToApi(draft);
    expect(api).toMatchObject({
      calculationMode: 'PERCENTAGE',
      fixedAmountIrr: null,
      percentageBasisPoints: 1000,
      cabin: 'BUSINESS',
    });
  });

  it('round-trips API → draft → API for FIXED', () => {
    const draft = chargeRuleFromApi({
      id: 'r1',
      title: 'مالیات',
      kind: 'TAX',
      calculationMode: 'FIXED',
      fixedAmountIrr: '50000',
      percentageBasisPoints: null,
      cabin: null,
      validFrom: null,
      validUntil: null,
      active: true,
    });
    expect(draft.method).toBe('FIXED');
    expect(draft.cabin).toBe('ALL');
    const again = draftRuleToApi(draft);
    expect(again.fixedAmountIrr).toBe('50000');
    expect(again.cabin).toBeNull();
  });

  it('preview helper keeps BUSINESS tax out of ECONOMY', () => {
    const drafts: DraftChargeRule[] = [
      {
        key: 'a',
        title: 'مالیات بیزینس',
        kind: 'TAX',
        method: 'FIXED',
        amountInput: '۵٬۰۰۰',
        cabin: 'BUSINESS',
        validFromIso: null,
        validUntilIso: null,
        active: true,
      },
    ];
    const previewRules = draftRulesForPreview(drafts);
    const economy = previewChargeTotalIrr(10_000_000, previewRules, 'ECONOMY');
    const business = previewChargeTotalIrr(10_000_000, previewRules, 'BUSINESS');
    expect(economy.totalIrr).toBe('10000000');
    expect(business.totalIrr).toBe('10050000');
  });
});
