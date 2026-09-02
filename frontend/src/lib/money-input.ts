import {
  faDigits,
  arDigits,
  latinDigits,
  parseTomanToRial,
  parseTomanToRialString,
} from "./fa-format";
import type { DisplayLocale } from "./fa-format";

/** Format raw user input with locale digits/separators (no float math). */
export function formatTomanGrouped(raw: string, locale: DisplayLocale = "fa"): string {
  const digits = latinDigits(raw).replace(/[^\d]/g, "");
  if (!digits) return "";
  const separator = locale === "en" ? "," : "٬";
  const withSep = digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  if (locale === "en") return withSep;
  return locale === "ar" ? arDigits(withSep) : faDigits(withSep);
}

export function tomanDigitsOnly(grouped: string): string {
  return latinDigits(grouped).replace(/[^\d]/g, "");
}

/** Keeps a controlled toman input Persian and grouped while the user types. */
export function normalizeTomanInput(raw: string): string {
  return formatTomanGrouped(tomanDigitsOnly(raw));
}

/** Convert MoneyInput display value to IRR via the shared utility (no float). */
export function moneyInputToRial(valueToman: string): number | null {
  return parseTomanToRial(tomanDigitsOnly(valueToman));
}

/** IRR decimal string for API payloads — BigInt-safe, never a float. */
export function moneyInputToRialString(valueToman: string): string | null {
  return parseTomanToRialString(tomanDigitsOnly(valueToman));
}
