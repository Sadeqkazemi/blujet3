import { describe, expect, it } from 'vitest';
import { formatTomanGrouped } from './money-input';

describe('formatTomanGrouped', () => {
  it('keeps grouped Persian digits for the fa locale', () => {
    expect(formatTomanGrouped('5000000', 'fa')).toBe('۵٬۰۰۰٬۰۰۰');
  });

  it('uses Latin digits and comma grouping for English', () => {
    expect(formatTomanGrouped('5000000', 'en')).toBe('5,000,000');
  });

  it('uses Arabic-Indic digits with Arabic grouping', () => {
    expect(formatTomanGrouped('5000000', 'ar')).toBe('٥٬٠٠٠٬٠٠٠');
  });
});
