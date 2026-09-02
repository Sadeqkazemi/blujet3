import { afterEach, describe, expect, it } from 'vitest';
import { tomanAmountInWords } from './amount-in-words';

describe('tomanAmountInWords', () => {
  afterEach(() => {
    // no shared state
  });

  it('converts Persian-digit toman amounts to words', () => {
    expect(tomanAmountInWords('۵۰۰۰', 'fa')).toBe('پنج هزار تومان');
    expect(tomanAmountInWords('2,450,000', 'fa')).toBe(
      'دو میلیون و چهارصد و پنجاه هزار تومان',
    );
  });

  it('supports English and Arabic', () => {
    expect(tomanAmountInWords(5000, 'en')).toBe('five thousand Toman');
    expect(tomanAmountInWords(12, 'ar')).toContain('تومان');
  });

  it('returns null for empty input', () => {
    expect(tomanAmountInWords('', 'fa')).toBeNull();
    expect(tomanAmountInWords('abc', 'fa')).toBeNull();
  });
});
