import { describe, expect, it } from 'vitest';
import { emptyPassenger } from './checkout-types';
import { isValidIranianNationalIdInput, validatePassengerFields } from './passenger-validation';

describe('passenger field validation', () => {
  it('returns localized required errors per field', () => {
    const errors = validatePassengerFields(emptyPassenger(''), 'fa');
    expect(errors.firstNameLatin).toBe('نام را وارد کنید.');
    expect(errors.lastNameLatin).toBe('نام خانوادگی را وارد کنید.');
    expect(errors.nationalId).toBe('کد ملی را وارد کنید.');
    expect(errors.birthDate).toBe('تاریخ تولد را کامل وارد کنید.');
  });

  it('validates the Iranian national-id checksum', () => {
    expect(isValidIranianNationalIdInput('0012345679')).toBe(true);
    expect(isValidIranianNationalIdInput('0012345678')).toBe(false);
    expect(isValidIranianNationalIdInput('1111111111')).toBe(false);
  });
});
