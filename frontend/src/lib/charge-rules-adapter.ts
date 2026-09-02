import type { CabinKind, ChargeKind } from './flight-definition';
import { formatTomanGrouped, moneyInputToRialString } from './money-input';
import { irrToTomanInput, latinDigits } from './fa-format';
import { dayjs, isoDateAtNoon, toIsoDateOnly } from './jalali';

/** Form-side calculation mode (UI). */
export type FormChargeMethod = 'FIXED' | 'PERCENT';

/** Wire calculation mode expected by backend contract. */
export type ApiChargeCalculationMode = 'FIXED' | 'PERCENTAGE';

/** UI draft for tax/fee rules (not the wire DTO). */
export interface DraftChargeRule {
  key: string;
  title: string;
  kind: ChargeKind;
  method: FormChargeMethod;
  /** Display: toman grouped for FIXED, percent digits for PERCENT. */
  amountInput: string;
  cabin: CabinKind | 'ALL';
  validFromIso: string | null;
  validUntilIso: string | null;
  active: boolean;
}

/** Backend-oriented charge rule (adapter output / API input). */
export interface ApiChargeRulePayload {
  id?: string;
  title: string;
  kind: ChargeKind;
  calculationMode: ApiChargeCalculationMode;
  /** Present when calculationMode === FIXED (IRR decimal string). */
  fixedAmountIrr: string | null;
  /** Present when calculationMode === PERCENTAGE (e.g. 10% → 1000). */
  percentageBasisPoints: number | null;
  /** null = apply to all cabins. */
  cabin: CabinKind | null;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
}

export function emptyDraftChargeRule(): DraftChargeRule {
  return {
    key: `ch-${Date.now()}`,
    title: '',
    kind: 'TAX',
    method: 'FIXED',
    amountInput: '',
    cabin: 'ALL',
    validFromIso: null,
    validUntilIso: null,
    active: true,
  };
}

/** Form draft → API payload (no guesswork beyond the agreed contract). */
export function draftRuleToApi(rule: DraftChargeRule): ApiChargeRulePayload {
  if (rule.method === 'FIXED') {
    return {
      title: rule.title.trim(),
      kind: rule.kind,
      calculationMode: 'FIXED',
      fixedAmountIrr: moneyInputToRialString(rule.amountInput) ?? '0',
      percentageBasisPoints: null,
      cabin: rule.cabin === 'ALL' ? null : rule.cabin,
      validFrom: rule.validFromIso,
      validUntil: rule.validUntilIso,
      active: rule.active,
    };
  }
  const percent = Number(latinDigits(rule.amountInput).replace(/[^\d.]/g, '')) || 0;
  // Keep integer basis points: 12.5% → 1250 when input has one decimal; otherwise percent * 100.
  const cleaned = latinDigits(rule.amountInput).replace(/[^\d.]/g, '');
  const basisPoints = cleaned.includes('.')
    ? Math.round(percent * 100)
    : Math.round(percent * 100);
  return {
    title: rule.title.trim(),
    kind: rule.kind,
    calculationMode: 'PERCENTAGE',
    fixedAmountIrr: null,
    percentageBasisPoints: basisPoints,
    cabin: rule.cabin === 'ALL' ? null : rule.cabin,
    validFrom: rule.validFromIso,
    validUntil: rule.validUntilIso,
    active: rule.active,
  };
}

export function draftRulesToApi(rules: DraftChargeRule[]): ApiChargeRulePayload[] {
  return rules.map(draftRuleToApi);
}

/** API → form draft for editing. */
export function chargeRuleFromApi(rule: {
  id?: string;
  title: string;
  kind: ChargeKind;
  calculationMode?: ApiChargeCalculationMode;
  /** Legacy form-compat fields (pre-adapter); prefer calculationMode. */
  method?: FormChargeMethod;
  amount?: number | string;
  fixedAmountIrr?: number | string | null;
  percentageBasisPoints?: number | null;
  cabin: CabinKind | 'ALL' | null;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
}): DraftChargeRule {
  const mode: ApiChargeCalculationMode =
    rule.calculationMode ??
    (rule.method === 'PERCENT' ? 'PERCENTAGE' : 'FIXED');
  const cabin: CabinKind | 'ALL' =
    rule.cabin == null || rule.cabin === 'ALL' ? 'ALL' : rule.cabin;

  if (mode === 'PERCENTAGE') {
    const legacyPercent =
      rule.amount != null ? Number(rule.amount) : null;
    const bp =
      rule.percentageBasisPoints ??
      (legacyPercent != null && Number.isFinite(legacyPercent)
        ? Math.round(legacyPercent * 100)
        : 0);
    const percentDisplay = (bp / 100).toString();
    return {
      key: rule.id ?? `ch-${Math.random().toString(36).slice(2)}`,
      title: rule.title,
      kind: rule.kind,
      method: 'PERCENT',
      amountInput: percentDisplay,
      cabin,
      validFromIso: rule.validFrom
        ? isoDateAtNoon(toIsoDateOnly(dayjs(rule.validFrom)))
        : null,
      validUntilIso: rule.validUntil
        ? isoDateAtNoon(toIsoDateOnly(dayjs(rule.validUntil)))
        : null,
      active: rule.active,
    };
  }

  const fixedIrr = rule.fixedAmountIrr ?? rule.amount ?? '0';
  return {
    key: rule.id ?? `ch-${Math.random().toString(36).slice(2)}`,
    title: rule.title,
    kind: rule.kind,
    method: 'FIXED',
    amountInput: formatTomanGrouped(irrToTomanInput(String(fixedIrr))),
    cabin,
    validFromIso: rule.validFrom
      ? isoDateAtNoon(toIsoDateOnly(dayjs(rule.validFrom)))
      : null,
    validUntilIso: rule.validUntil
      ? isoDateAtNoon(toIsoDateOnly(dayjs(rule.validUntil)))
      : null,
    active: rule.active,
  };
}

/** Normalize draft rules into the shape previewChargeTotalIrr expects. */
export function draftRulesForPreview(rules: DraftChargeRule[]) {
  return rules.map((r) => {
    const api = draftRuleToApi(r);
    const amount: number | string =
      api.calculationMode === 'FIXED'
        ? (api.fixedAmountIrr ?? '0')
        : (api.percentageBasisPoints ?? 0) / 100;
    return {
      kind: r.kind,
      method: r.method,
      amount,
      cabin: r.cabin,
      active: r.active,
      title: r.title,
    };
  });
}
