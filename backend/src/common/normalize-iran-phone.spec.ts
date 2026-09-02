import {
  normalizeIranPhone,
  toLatinDigits,
  toLocalIranMobile,
} from './normalize-iran-phone';

describe('toLatinDigits', () => {
  it('converts Persian digits', () => {
    expect(toLatinDigits('۰۹۱۲۳۴۵۶۷۸')).toBe('0912345678');
  });
});

describe('normalizeIranPhone', () => {
  it('normalizes local mobile to E.164', () => {
    expect(normalizeIranPhone('09121234567')).toBe('+989121234567');
  });

  it('accepts Persian digits', () => {
    expect(normalizeIranPhone('۰۹۱۲۱۲۳۴۵۶۷')).toBe('+989121234567');
  });
});

describe('toLocalIranMobile', () => {
  it('returns 09… from E.164', () => {
    expect(toLocalIranMobile('+989121234567')).toBe('09121234567');
  });
});
