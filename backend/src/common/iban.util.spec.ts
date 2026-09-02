import {
  isValidSheba,
  maskCardPan,
  maskSheba,
  normalizeCardPan,
  normalizeSheba,
  guessBankFromPan,
} from './iban.util';

describe('iban.util', () => {
  it('normalizes Persian digits in card and sheba', () => {
    expect(normalizeCardPan('۶۱۰۴۳۳۷۱۱۲۳۴۴۵۲۱')).toBe('6104337112344521');
    expect(normalizeSheba('ir۰۶۰۱۲۰۰۰۰۰۰۰۳۳۲۲۱۱۴۵۲۱')).toBe(
      'IR0601200000003322114521',
    );
  });

  it('validates known-good Iranian IBAN', () => {
    expect(isValidSheba('IR820540102680020817909002')).toBe(true);
    expect(isValidSheba('IR0601200000003322114521')).toBe(false);
  });

  it('masks card PAN and sheba for display', () => {
    expect(maskCardPan('6104337112344521')).toBe('6104 3371 •••• 4521');
    expect(maskSheba('IR820540102680020817909002')).toBe('820540•••9002');
  });

  it('guesses bank from BIN', () => {
    expect(guessBankFromPan('6104337112344521').bankShort).toBe('ملت');
    expect(guessBankFromPan('6219861977777730').bankShort).toBe('سامان');
  });
});
