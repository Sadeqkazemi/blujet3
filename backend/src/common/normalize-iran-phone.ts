/** Convert Persian / Arabic-Indic digits in user input to Latin. */
export function toLatinDigits(value: string): string {
  return value
    .trim()
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** Normalize Iranian mobile numbers to E.164 (+98…) for DB lookup. */
export function normalizeIranPhone(phone: string): string {
  const p = toLatinDigits(phone).replace(/\s/g, '');
  if (p.startsWith('+98')) return p;
  if (p.startsWith('0098')) return `+${p.slice(2)}`;
  if (p.startsWith('09')) return `+98${p.slice(1)}`;
  return p;
}

/** Strip to local 09… form for API validation (after digit normalization). */
export function toLocalIranMobile(phone: string): string {
  const e164 = normalizeIranPhone(phone);
  if (e164.startsWith('+989') && e164.length === 13) {
    return `0${e164.slice(3)}`;
  }
  return toLatinDigits(phone).replace(/\s/g, '');
}
