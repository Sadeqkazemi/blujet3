import { describe, expect, it } from 'vitest';
import {
  apiToCheckoutSavedOptions,
  monthNameToValue,
  resolveCheckoutSavedPassengers,
  savedOptionToPassengerPatch,
} from './checkout-saved-pax';

describe('checkout-saved-pax', () => {
  it('maps Jalali and Gregorian month names to 1–12', () => {
    expect(monthNameToValue('خرداد')).toBe('3');
    expect(monthNameToValue('مرداد')).toBe('5');
    expect(monthNameToValue('June')).toBe('6');
    expect(monthNameToValue('August')).toBe('8');
    expect(monthNameToValue('6')).toBe('6');
  });

  it('returns no fabricated passenger when the account list is empty', () => {
    expect(resolveCheckoutSavedPassengers([], 'fa')).toEqual([]);
  });

  it('savedOptionToPassengerPatch uppercases Latin names', () => {
    const patch = savedOptionToPassengerPatch({
      id: 'saved-1',
      label: 'Real Passenger',
      firstNameLatin: 'Negar',
      lastNameLatin: 'Rezaei',
      gender: 'female',
      nationalId: '0011223344',
      passportNo: '',
      birthDay: '13',
      birthMonth: '6',
      birthYear: '1370',
    });
    expect(patch.firstNameLatin).toBe('NEGAR');
    expect(patch.lastNameLatin).toBe('REZAEI');
  });

  it('treats a legacy one-part Latin name as the last name', () => {
    const [option] = apiToCheckoutSavedOptions(
      [
        {
          id: 'saved-legacy',
          fullName: 'صادق کاظمی',
          latinName: 'KAZEMI',
          gender: 'male',
          birthDate: '1999-02-10',
          nationalId: '0603267874',
          passportNo: null,
          mobile: null,
          isChild: false,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      'fa',
    );

    expect(option?.firstNameLatin).toBe('');
    expect(option?.lastNameLatin).toBe('KAZEMI');
  });

  it('recovers a missing Latin first name from a complete Latin full name', () => {
    const [option] = apiToCheckoutSavedOptions(
      [
        {
          id: 'saved-legacy-latin-full-name',
          fullName: 'SADEQ KAZEMI',
          latinName: 'KAZEMI',
          gender: 'male',
          birthDate: '1999-02-10',
          nationalId: '0603267874',
          passportNo: null,
          mobile: null,
          isChild: false,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      'fa',
    );

    expect(option?.firstNameLatin).toBe('SADEQ');
    expect(option?.lastNameLatin).toBe('KAZEMI');
  });
});
