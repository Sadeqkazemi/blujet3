import { latinDigits } from "./fa-format";

const ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
const TEENS = [
  "ده",
  "یازده",
  "دوازده",
  "سیزده",
  "چهارده",
  "پانزده",
  "شانزده",
  "هفده",
  "هجده",
  "نوزده",
];
const TENS = [
  "",
  "",
  "بیست",
  "سی",
  "چهل",
  "پنجاه",
  "شصت",
  "هفتاد",
  "هشتاد",
  "نود",
];
const HUNDREDS = [
  "",
  "صد",
  "دویست",
  "سیصد",
  "چهارصد",
  "پانصد",
  "ششصد",
  "هفتصد",
  "هشتصد",
  "نهصد",
];
const SCALES = [
  "",
  "هزار",
  "میلیون",
  "میلیارد",
  "تریلیون",
  "کوادریلیون",
  "کوینتیلیون",
];

function belowThousand(value: number): string {
  const words: string[] = [];
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  if (hundreds) words.push(HUNDREDS[hundreds]);
  if (remainder >= 10 && remainder < 20) {
    words.push(TEENS[remainder - 10]);
  } else {
    const tens = Math.floor(remainder / 10);
    const ones = remainder % 10;
    if (tens) words.push(TENS[tens]);
    if (ones) words.push(ONES[ones]);
  }
  return words.join(" و ");
}

/** Converts a non-negative integer input into Persian words without Number precision loss. */
export function persianIntegerWords(raw: string): string | null {
  const normalized = latinDigits(raw).replace(/[٬,\s]/g, "");
  if (!/^\d+$/.test(normalized)) return null;

  let value: bigint;
  try {
    value = BigInt(normalized);
  } catch {
    return null;
  }
  if (value === 0n) return "صفر";

  const groups: string[] = [];
  let scale = 0;
  while (value > 0n) {
    const group = Number(value % 1000n);
    if (group) {
      const scaleWord = SCALES[scale];
      if (scale >= SCALES.length) return null;
      groups.unshift(
        `${belowThousand(group)}${scaleWord ? ` ${scaleWord}` : ""}`,
      );
    }
    value /= 1000n;
    scale += 1;
  }
  return groups.join(" و ");
}

export function tomanInputWords(raw: string): string {
  if (!raw.trim()) return "";
  const words = persianIntegerWords(raw);
  return words ? `${words} تومان` : "";
}
