import { faDigits, latinDigits } from "./fa-format";

export type CabinKind = "FIRST" | "BUSINESS" | "COMFORT" | "ECONOMY";

export type FlightApprovalStatus =
  | "DRAFT"
  | "PENDING_OPERATIONS"
  | "OPERATIONS_REJECTED"
  | "PENDING_CEO"
  | "APPROVED"
  | "PUBLISHED"
  | "REJECTED"
  | "PENDING_REVISION";

export type ChargeKind = 'TAX' | 'FEE';
/** UI / preview method; wire adapter maps PERCENT → PERCENTAGE. */
export type ChargeMethod = 'FIXED' | 'PERCENT';

export const FLIGHT_NO_PATTERN = /^[A-Z]{2}\d{4}$/;

export const CABIN_OPTIONS: { value: CabinKind; label: string }[] = [
  { value: 'FIRST', label: 'فرست' },
  { value: 'BUSINESS', label: 'بیزینس' },
  { value: 'COMFORT', label: 'کامفورت' },
  { value: 'ECONOMY', label: 'اکونومی' },
];

export const CABIN_KIND_ORDER: CabinKind[] = ['ECONOMY', 'COMFORT', 'BUSINESS', 'FIRST'];

export const APPROVAL_STATUS_META: Record<
  FlightApprovalStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: "پیش‌نویس", className: "bg-[#9fb0c724] text-[#9fb0c7]" },
  PENDING_OPERATIONS: {
    label: "در انتظار بررسی مدیر عملیات",
    className: "bg-[#f59e0b24] text-[#f59e0b]",
  },
  OPERATIONS_REJECTED: {
    label: "ردشده توسط مدیر عملیات",
    className: "bg-[#f8717124] text-[#f87171]",
  },
  PENDING_CEO: {
    label: "در انتظار تأیید مدیرعامل",
    className: "bg-[#a78bfa24] text-[#a78bfa]",
  },
  APPROVED: { label: "تأییدشده", className: "bg-[#34d39924] text-[#34d399]" },
  PUBLISHED: { label: "منتشرشده", className: "bg-[#34d39924] text-[#34d399]" },
  REJECTED: { label: "ردشده", className: "bg-[#f8717124] text-[#f87171]" },
  PENDING_REVISION: {
    label: "تغییرات در انتظار تأیید",
    className: "bg-[#f59e0b24] text-[#f59e0b]",
  },
};

/**
 * Normalize flight-number input: Persian/Arabic digits → Latin, uppercase.
 * Does NOT trim and does NOT strip spaces/hyphens — pasted `" XY1234 "` must
 * stay invalid (backend rejects anything outside `^[A-Z]{2}\\d{4}$`).
 * When the value is already pure A-Z0-9, cap at 6 chars for typing UX.
 */
export function sanitizeFlightNoInput(raw: string): string {
  const upper = latinDigits(raw).toUpperCase();
  if (/[^A-Z0-9]/.test(upper)) return upper;
  return upper.slice(0, 6);
}

export function isValidFlightNo(value: string): boolean {
  if (value !== value.trim()) return false;
  return FLIGHT_NO_PATTERN.test(value);
}

export function flightNoError(value: string): string | null {
  if (!value) return "شماره پرواز را وارد کنید";
  if (!isValidFlightNo(value)) {
    return "شماره پرواز باید دقیقاً دو حرف لاتین و چهار رقم باشد (مثال: XY1234)";
  }
  return null;
}

export function isValidHhMm(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function minutesFromDuration(
  hours: number,
  minutes: number,
): number | null {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 24) return null;
  if (minutes < 0 || minutes > 55 || minutes % 5 !== 0) return null;
  if (hours === 0 && minutes === 0) return null;
  if (hours === 24 && minutes !== 0) return null;
  return hours * 60 + minutes;
}

export function splitDurationMinutes(total: number): {
  hours: number;
  minutes: number;
} {
  const safe = Math.max(0, Math.floor(total));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}

export function formatDurationFa(totalMinutes: number): string {
  const { hours, minutes } = splitDurationMinutes(totalMinutes);
  if (hours === 0) return `${faDigits(minutes)} دقیقه`;
  if (minutes === 0) return `${faDigits(hours)} ساعت`;
  return `${faDigits(hours)} ساعت و ${faDigits(minutes)} دقیقه`;
}

/** Arrival HH:mm from departure HH:mm + duration; wraps past midnight. */
export function computeArrivalHhMm(
  departureHhMm: string,
  durationMinutes: number,
): string | null {
  if (
    !isValidHhMm(departureHhMm) ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return null;
  }
  const [h, m] = departureHhMm.split(":").map(Number);
  const total = h! * 60 + m! + Math.floor(durationMinutes);
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const ah = Math.floor(wrapped / 60);
  const am = wrapped % 60;
  return `${String(ah).padStart(2, "0")}:${String(am).padStart(2, "0")}`;
}

export function cabinLabel(cabin: CabinKind): string {
  return CABIN_OPTIONS.find((c) => c.value === cabin)?.label ?? cabin;
}

export function publicCabinLabel(
  cabin: CabinKind,
  locale: 'fa' | 'en' | 'ar' = 'fa',
): string {
  if (locale === 'en') {
    return cabin === 'FIRST'
      ? 'First'
      : cabin === 'BUSINESS'
        ? 'Business'
        : cabin === 'COMFORT'
          ? 'Comfort'
          : 'Economy';
  }
  if (locale === 'ar') {
    return cabin === 'FIRST'
      ? 'الدرجة الأولى'
      : cabin === 'BUSINESS'
        ? 'رجال الأعمال'
        : cabin === 'COMFORT'
          ? 'كومفورت'
          : 'اقتصادية';
  }
  return cabinLabel(cabin);
}

export function sumCabinSeats(rows: { seats: number }[]): number {
  return rows.reduce(
    (acc, row) => acc + (Number.isFinite(row.seats) ? row.seats : 0),
    0,
  );
}

export type PreviewChargeRule = {
  kind: ChargeKind;
  method: ChargeMethod;
  /** FIXED: IRR (number or decimal string); PERCENT: percent points (10 = 10%). */
  amount: number | string;
  cabin: CabinKind | 'ALL';
  active: boolean;
  title?: string;
};

export type ChargePreviewLine = { title: string; amountIrr: string };
export type ChargePreviewResult = {
  lines: ChargePreviewLine[];
  totalIrr: string;
};

function toIrrBigInt(value: number | string | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0n;
    return BigInt(Math.round(value));
  }
  const cleaned = String(value).replace(/[٬,\s]/g, '');
  if (!cleaned || !/^-?\d+$/.test(cleaned)) return 0n;
  return BigInt(cleaned);
}

/**
 * Preview-only charge total for ONE specific cabin.
 * Rules with cabin=ALL apply to every cabin; cabin-specific rules apply only
 * to that cabin. Totals are BigInt-backed decimal strings (no float IRR math).
 */
export function previewChargeTotalIrr(
  basePriceIrr: number | string | bigint,
  rules: PreviewChargeRule[],
  cabin: CabinKind,
): ChargePreviewResult {
  const lines: ChargePreviewLine[] = [];
  const base = toIrrBigInt(basePriceIrr);
  let total = base;
  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.cabin !== 'ALL' && rule.cabin !== cabin) continue;
    let amountIrr: bigint;
    if (rule.method === 'FIXED') {
      amountIrr = toIrrBigInt(rule.amount);
    } else {
      // Percent points are small display numbers (e.g. 10 = 10%) — safe as number.
      const pct = Number(rule.amount);
      const pctRounded = Number.isFinite(pct) ? Math.round(pct) : 0;
      amountIrr = (base * BigInt(pctRounded)) / 100n;
    }
    lines.push({
      title:
        rule.title?.trim() ||
        (rule.kind === 'TAX' ? 'مالیات' : 'عوارض'),
      amountIrr: amountIrr.toString(),
    });
    total += amountIrr;
  }
  return { lines, totalIrr: total.toString() };
}

/** Per-cabin preview summaries — never merges BUSINESS taxes into ECONOMY. */
export function previewChargeTotalsByCabin(
  basePriceIrr: number | string | bigint,
  rules: PreviewChargeRule[],
): Record<CabinKind, ChargePreviewResult> {
  return {
    ECONOMY: previewChargeTotalIrr(basePriceIrr, rules, 'ECONOMY'),
    COMFORT: previewChargeTotalIrr(basePriceIrr, rules, 'COMFORT'),
    BUSINESS: previewChargeTotalIrr(basePriceIrr, rules, 'BUSINESS'),
    FIRST: previewChargeTotalIrr(basePriceIrr, rules, 'FIRST'),
  };
}
