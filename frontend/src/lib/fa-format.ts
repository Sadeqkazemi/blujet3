const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** Converts Latin digits in a string/number to Persian digits for display. */
export function faDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** Formats a plain integer count with Persian digits and thousands separators. */
export function faNumber(value: number): string {
  return faDigits(Math.round(value).toLocaleString('en-US').replace(/,/g, '٬'));
}

/** Converts Latin digits in a string/number to Eastern Arabic-Indic digits. */
export function arDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);
}

export type DisplayLocale = 'fa' | 'en' | 'ar';

/**
 * Formats a plain toman amount (already converted from rial, e.g. page-local
 * marketing mock figures) with locale-appropriate digits and ٬/, thousands
 * separators. For a raw IRR amount straight from the API, use `faMoney`
 * instead — that's the only place the rial→toman division happens.
 */
export function formatToman(tomanAmount: number, locale: DisplayLocale): string {
  const grouped = Math.round(tomanAmount).toLocaleString('en-US');
  if (locale === 'en') return grouped;
  const withSeparator = grouped.replace(/,/g, '٬');
  return locale === 'ar' ? arDigits(withSeparator) : faDigits(withSeparator);
}

/** Locale-aware percent, e.g. formatLocalePercent(19, 'en') -> "19%", ('fa') -> "۱۹٪". */
export function formatLocalePercent(value: number, locale: DisplayLocale): string {
  if (locale === 'en') return `${value}%`;
  return `${locale === 'ar' ? arDigits(value) : faDigits(value)}٪`;
}

/**
 * Formats an integer IRR amount as تومان (rial ÷ 10) with ٬ thousands
 * separators and Persian digits. This is the ONLY place rial→toman
 * conversion happens — never divide by 10 anywhere else.
 *
 * API money fields are decimal STRINGs on the wire (a JS `number` can't
 * safely hold IRR amounts above 2^53 — see backend `common/bigint-json.ts`),
 * so this accepts either; the string form is parsed with `Number()` for
 * DISPLAY ONLY. Individual ticket/fee amounts are always far below 2^53 so
 * no precision is lost — never reconstruct a request body from this parsed
 * value, always pass the original API string/user input through unchanged.
 */
export function faMoney(amountRial: number | string): string {
  const toman = Math.round(Number(amountRial) / 10);
  const grouped = toman.toLocaleString('en-US').replace(/,/g, '٬');
  return faDigits(grouped);
}

/**
 * Compact IRR→تومان label for executive charts/KPIs (design: میلیارد / میلیون).
 * Rial→toman conversion still happens only here alongside `faMoney`.
 */
export function faMoneyCompact(amountRial: number | string): string {
  const toman = Math.round(Number(amountRial) / 10);
  const billion = toman / 1_000_000_000;
  if (billion >= 1) {
    const rounded = Math.round(billion * 10) / 10;
    const raw = Number.isInteger(rounded)
      ? rounded.toLocaleString('en-US')
      : rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `${faDigits(raw.replace(/,/g, '٬').replace('.', '٫'))} میلیارد`;
  }
  const million = Math.round(toman / 1_000_000);
  return `${faDigits(million.toLocaleString('en-US').replace(/,/g, '٬'))} میلیون`;
}

/**
 * Scaled number only (no unit word) for chart channel tiles / bar tops when
 * the unit is shown separately (e.g. «میلیارد تومان» in the caption).
 */
export function faMoneyCompactNumber(amountRial: number | string): string {
  const toman = Math.round(Number(amountRial) / 10);
  const billion = toman / 1_000_000_000;
  if (billion >= 1) {
    const rounded = Math.round(billion * 10) / 10;
    const raw = Number.isInteger(rounded)
      ? rounded.toLocaleString('en-US')
      : rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return faDigits(raw.replace(/,/g, '٬').replace('.', '٫'));
  }
  const million = Math.round(toman / 1_000_000);
  if (million >= 1) {
    return faDigits(million.toLocaleString('en-US').replace(/,/g, '٬'));
  }
  return faMoney(amountRial);
}

/**
 * Locale-aware version of `faMoney`: converts a real IRR amount from the API
 * to toman (rial ÷ 10 — still the only place that division happens) and
 * formats it with the active locale's digits/separators via `formatToman`.
 * Accepts a decimal string (the wire shape) or a number — see `faMoney`'s
 * doc comment for why `Number()` is safe here for display purposes only.
 */
export function localeMoney(
  amountRial: number | string,
  locale: DisplayLocale,
): string {
  return formatToman(Math.round(Number(amountRial) / 10), locale);
}

/** Persian-digit percentage, e.g. faPercent(12.5) -> "۱۲.۵٪" */
export function faPercent(value: number): string {
  return `${faDigits(value)}٪`;
}

/** Converts Persian/Arabic digits in user input back to Latin digits. */
export function latinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** Normalizes Iranian mobile input to Latin digits only (max 11 chars). */
export function normalizeIranMobile(raw: string): string {
  return latinDigits(raw).replace(/\D/g, '').slice(0, 11);
}

export function isValidIranMobile(phone: string): boolean {
  return /^09\d{9}$/.test(phone);
}

/**
 * Parses a تومان amount typed by the user (Persian or Latin digits, optional
 * ٬/, separators) into integer IRR. The rial↔toman conversion lives ONLY in
 * this module. Returns null for non-numeric input.
 *
 * @deprecated Prefer `parseTomanToRialString` for API payloads — JS `number`
 * cannot safely hold IRR above 2^53. Kept for display-adjacent call sites
 * that still expect a number.
 */
export function parseTomanToRial(input: string): number | null {
  const asString = parseTomanToRialString(input);
  if (asString === null) return null;
  const n = Number(asString);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Parses تومان user input into an IRR decimal string (toman × 10) without
 * `Number`/`float`. Returns null for empty or non-digit input.
 */
export function parseTomanToRialString(input: string): string | null {
  const cleaned = latinDigits(input).replace(/[٬,\s]/g, '');
  if (!cleaned || !/^\d+$/.test(cleaned)) return null;
  return (BigInt(cleaned) * 10n).toString();
}

/**
 * Prefill helper: IRR decimal string → integer تومان digits (no separators).
 * Uses BigInt integer division by 10n — never `Number(x) / 10`.
 */
export function irrToTomanInput(irr: string | null | undefined): string {
  if (irr == null || irr === '') return '';
  const cleaned = latinDigits(String(irr)).replace(/[٬,\s]/g, '');
  if (!cleaned || !/^-?\d+$/.test(cleaned)) return '';
  try {
    return (BigInt(cleaned) / 10n).toString();
  } catch {
    return '';
  }
}

/** Compare two IRR decimal strings as BigInt. Returns -1 / 0 / 1. */
export function compareIrrStrings(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Percent delta of `proposed` vs `competitor` using BigInt math.
 * Returns null when competitor is zero / unparsable.
 */
export function irrPercentDelta(
  proposed: string | number,
  competitor: string | number,
): number | null {
  try {
    const p = BigInt(String(proposed));
    const c = BigInt(String(competitor));
    if (c === 0n) return null;
    // Hundredths of a percent: ((p-c)*10000)/c, then ÷100 for display percent.
    return Number(((p - c) * 10000n) / c) / 100;
  } catch {
    return null;
  }
}
