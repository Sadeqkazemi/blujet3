import { describe, expect, it } from 'vitest';
import {
  arDigits,
  compareIrrStrings,
  faDigits,
  faNumber,
  faMoney,
  faMoneyCompact,
  faMoneyCompactNumber,
  faPercent,
  formatLocalePercent,
  formatToman,
  irrPercentDelta,
  irrToTomanInput,
  localeMoney,
  parseTomanToRialString,
} from './fa-format';

describe('faDigits', () => {
  it('converts Latin digits to Persian digits', () => {
    expect(faDigits(1234567890)).toBe('۱۲۳۴۵۶۷۸۹۰');
  });

  it('leaves non-digit characters untouched', () => {
    expect(faDigits('PNR-42')).toBe('PNR-۴۲');
  });
});

describe('faNumber', () => {
  it('groups a plain count with Persian digits', () => {
    expect(faNumber(3840)).toBe('۳٬۸۴۰');
  });
});

describe('faMoney', () => {
  it('converts rial to toman (÷10) with ٬ thousands separators and Persian digits', () => {
    expect(faMoney(127_680_000_000)).toBe('۱۲٬۷۶۸٬۰۰۰٬۰۰۰');
  });

  it('rounds to the nearest toman', () => {
    expect(faMoney(15)).toBe('۲');
  });

  it('handles zero', () => {
    expect(faMoney(0)).toBe('۰');
  });

  it('accepts a decimal string, the real API wire shape for IRR fields', () => {
    expect(faMoney('127680000000')).toBe('۱۲٬۷۶۸٬۰۰۰٬۰۰۰');
  });
});

describe('faMoneyCompact', () => {
  it('formats large amounts as میلیارد تومان-scale labels', () => {
    // 3_320_000_000_000 IRR → 332_000_000_000 تومان → ۳۳۲ میلیارد
    expect(faMoneyCompact('3320000000000')).toBe('۳۳۲ میلیارد');
  });

  it('formats mid amounts as میلیون', () => {
    // 90_000_000 IRR → 9_000_000 تومان → ۹ میلیون
    expect(faMoneyCompact(90_000_000)).toBe('۹ میلیون');
  });
});

describe('faMoneyCompactNumber', () => {
  it('returns the scaled number without the unit word', () => {
    expect(faMoneyCompactNumber('3320000000000')).toBe('۳۳۲');
  });
});

describe('faPercent', () => {
  it('appends the Persian percent sign with Persian digits', () => {
    expect(faPercent(42)).toBe('۴۲٪');
  });
});

describe('arDigits', () => {
  it('converts Latin digits to Eastern Arabic-Indic digits', () => {
    expect(arDigits(12450)).toBe('١٢٤٥٠');
  });
});

describe('formatToman', () => {
  it('formats fa with Persian digits and ٬ separators', () => {
    expect(formatToman(1_600_000, 'fa')).toBe('۱٬۶۰۰٬۰۰۰');
  });

  it('formats en with Latin digits and , separators', () => {
    expect(formatToman(1_600_000, 'en')).toBe('1,600,000');
  });

  it('formats ar with Eastern Arabic-Indic digits and ٬ separators', () => {
    expect(formatToman(1_600_000, 'ar')).toBe('١٬٦٠٠٬٠٠٠');
  });
});

describe('formatLocalePercent', () => {
  it('fa/ar use ٪ with locale digits, en uses %', () => {
    expect(formatLocalePercent(19, 'fa')).toBe('۱۹٪');
    expect(formatLocalePercent(19, 'ar')).toBe('١٩٪');
    expect(formatLocalePercent(19, 'en')).toBe('19%');
  });
});

describe('localeMoney', () => {
  it('converts rial to toman (÷10) then formats per locale, matching faMoney for fa', () => {
    expect(localeMoney(380_000_000, 'fa')).toBe(faMoney(380_000_000));
    expect(localeMoney(380_000_000, 'fa')).toBe('۳۸٬۰۰۰٬۰۰۰');
    expect(localeMoney(380_000_000, 'en')).toBe('38,000,000');
    expect(localeMoney(380_000_000, 'ar')).toBe('٣٨٬٠٠٠٬٠٠٠');
  });

  it('accepts a decimal string, the real API wire shape for IRR fields', () => {
    expect(localeMoney('380000000', 'fa')).toBe('۳۸٬۰۰۰٬۰۰۰');
  });
});

describe('parseTomanToRialString / irrToTomanInput', () => {
  it('multiplies toman by 10 as a BigInt decimal string', () => {
    expect(parseTomanToRialString('3850000')).toBe('38500000');
    expect(parseTomanToRialString('۳٬۸۵۰٬۰۰۰')).toBe('38500000');
    expect(parseTomanToRialString('')).toBeNull();
    expect(parseTomanToRialString('12.5')).toBeNull();
  });

  it('prefills toman via integer division by 10n', () => {
    expect(irrToTomanInput('38500000')).toBe('3850000');
    expect(irrToTomanInput(null)).toBe('');
    expect(irrToTomanInput('15')).toBe('1');
  });

  it('compares and deltas IRR strings with BigInt', () => {
    expect(compareIrrStrings('100', '200')).toBe(-1);
    expect(compareIrrStrings('200', '200')).toBe(0);
    expect(irrPercentDelta('103', '100')).toBe(3);
    expect(irrPercentDelta('97', '100')).toBe(-3);
  });
});
