import type { StoredLocale } from '../hooks/useLocale';
import { latinDigits } from './fa-format';

const FA_ONES = [
  '',
  'یک',
  'دو',
  'سه',
  'چهار',
  'پنج',
  'شش',
  'هفت',
  'هشت',
  'نه',
  'ده',
  'یازده',
  'دوازده',
  'سیزده',
  'چهارده',
  'پانزده',
  'شانزده',
  'هفده',
  'هجده',
  'نوزده',
];
const FA_TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const FA_HUNDREDS = [
  '',
  'صد',
  'دویست',
  'سیصد',
  'چهارصد',
  'پانصد',
  'ششصد',
  'هفتصد',
  'هشتصد',
  'نهصد',
];
const FA_SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

const EN_ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const EN_TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];
const EN_SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

const AR_ONES = [
  '',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];
const AR_TENS = [
  '',
  '',
  'عشرون',
  'ثلاثون',
  'أربعون',
  'خمسون',
  'ستون',
  'سبعون',
  'ثمانون',
  'تسعون',
];
const AR_HUNDREDS = [
  '',
  'مائة',
  'مائتان',
  'ثلاثمائة',
  'أربعمائة',
  'خمسمائة',
  'ستمائة',
  'سبعمائة',
  'ثمانمائة',
  'تسعمائة',
];
const AR_SCALES = ['', 'ألف', 'مليون', 'مليار', 'تريليون'];

function parsePositiveInt(raw: string): number | null {
  const digits = latinDigits(raw).replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function underThousandFa(n: number): string {
  if (n === 0) return '';
  if (n < 20) return FA_ONES[n];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones ? `${FA_TENS[tens]} و ${FA_ONES[ones]}` : FA_TENS[tens];
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = FA_HUNDREDS[hundreds];
  if (!rest) return head;
  return `${head} و ${underThousandFa(rest)}`;
}

function underThousandEn(n: number): string {
  if (n === 0) return '';
  if (n < 20) return EN_ONES[n];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones ? `${EN_TENS[tens]}-${EN_ONES[ones]}` : EN_TENS[tens];
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = `${EN_ONES[hundreds]} hundred`;
  if (!rest) return head;
  return `${head} ${underThousandEn(rest)}`;
}

function underThousandAr(n: number): string {
  if (n === 0) return '';
  if (n < 20) return AR_ONES[n];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones ? `${AR_ONES[ones]} و ${AR_TENS[tens]}` : AR_TENS[tens];
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = AR_HUNDREDS[hundreds];
  if (!rest) return head;
  return `${head} و ${underThousandAr(rest)}`;
}

function integerToWordsFa(n: number): string {
  if (n === 0) return 'صفر';
  const parts: string[] = [];
  let scale = 0;
  let remaining = n;
  while (remaining > 0 && scale < FA_SCALES.length) {
    const chunk = remaining % 1000;
    if (chunk) {
      const chunkWords = underThousandFa(chunk);
      const scaleWord = FA_SCALES[scale];
      parts.unshift(scaleWord ? `${chunkWords} ${scaleWord}` : chunkWords);
    }
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }
  return parts.join(' و ');
}

function integerToWordsEn(n: number): string {
  if (n === 0) return 'zero';
  const parts: string[] = [];
  let scale = 0;
  let remaining = n;
  while (remaining > 0 && scale < EN_SCALES.length) {
    const chunk = remaining % 1000;
    if (chunk) {
      const chunkWords = underThousandEn(chunk);
      const scaleWord = EN_SCALES[scale];
      parts.unshift(scaleWord ? `${chunkWords} ${scaleWord}` : chunkWords);
    }
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }
  return parts.join(' ');
}

function integerToWordsAr(n: number): string {
  if (n === 0) return 'صفر';
  const parts: string[] = [];
  let scale = 0;
  let remaining = n;
  while (remaining > 0 && scale < AR_SCALES.length) {
    const chunk = remaining % 1000;
    if (chunk) {
      const chunkWords = underThousandAr(chunk);
      const scaleWord = AR_SCALES[scale];
      parts.unshift(scaleWord ? `${chunkWords} ${scaleWord}` : chunkWords);
    }
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }
  return parts.join(' و ');
}

const UNIT: Record<StoredLocale, string> = {
  fa: 'تومان',
  en: 'Toman',
  ar: 'تومان',
};

/** Convert a toman amount string/number to locale words, e.g. 5000 → «پنج هزار تومان». */
export function tomanAmountInWords(
  raw: string | number,
  locale: StoredLocale,
): string | null {
  const n = typeof raw === 'number' ? Math.floor(raw) : parsePositiveInt(raw);
  if (n === null) return null;
  const words =
    locale === 'en'
      ? integerToWordsEn(n)
      : locale === 'ar'
        ? integerToWordsAr(n)
        : integerToWordsFa(n);
  return `${words} ${UNIT[locale]}`;
}
