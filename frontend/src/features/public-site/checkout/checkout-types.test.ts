import { describe, expect, it } from 'vitest';
import {
  buildPassengersFromMix,
  extraDescription,
  extraTitle,
  passengerTotalIrr,
  passengerTypeOrdinal,
  seatCountForMix,
  validatePassengerAges,
} from './checkout-types';

describe('passenger pricing helpers', () => {
  it('uses localized ancillary text without Persian fallback in English or Arabic', () => {
    const extra = {
      id: 'e1',
      code: 'EXTRA_BAGGAGE' as const,
      titleFa: 'بار اضافه',
      titleEn: 'Extra baggage',
      titleAr: 'أمتعة إضافية',
      descriptionFa: 'شرح فارسی',
      descriptionEn: 'Extra baggage allowance',
      descriptionAr: 'وزن أمتعة إضافي',
      billingUnit: 'PER_KG' as const,
      priceIrr: '1000',
      selected: false,
      quantity: 1,
    };

    expect(extraTitle(extra, 'en')).toBe('Extra baggage');
    expect(extraTitle(extra, 'ar')).toBe('أمتعة إضافية');
    expect(extraDescription(extra, 'en')).toBe('Extra baggage allowance');
    expect(extraDescription(extra, 'ar')).toBe('وزن أمتعة إضافي');
  });
  it('calculates system adult, child and infant totals', () => {
    expect(
      passengerTotalIrr('1000000', { adults: 1, children: 1, infants: 1 }),
    ).toBe(1_600_000n);
  });

  it('uses age on the flight date for child and infant validation', () => {
    expect(
      validatePassengerAges(
        [{ passengerType: 'CHILD', birthDate: '2014-08-11' }],
        '2026-08-10T10:00:00.000Z',
      ),
    ).toBeNull();
    expect(
      validatePassengerAges(
        [{ passengerType: 'CHILD', birthDate: '2014-08-10' }],
        '2026-08-10T10:00:00.000Z',
      ),
    ).toBe('CHILD_AGE_INVALID');
  });

  it('requires the adult passenger to be fully 12 on the departure date', () => {
    expect(
      validatePassengerAges(
        [{ passengerType: 'ADULT', birthDate: '2014-08-11' }],
        '2026-08-10T10:00:00.000Z',
      ),
    ).toBe('ADULT_TOO_YOUNG');
    expect(
      validatePassengerAges(
        [{ passengerType: 'ADULT', birthDate: '2014-08-10' }],
        '2026-08-10T10:00:00.000Z',
      ),
    ).toBeNull();
  });

  it('allows an under-two passenger on a child fare with a dedicated seat', () => {
    expect(
      validatePassengerAges(
        [{ passengerType: 'CHILD', birthDate: '2025-08-10' }],
        '2026-08-10T10:00:00.000Z',
      ),
    ).toBeNull();
  });

  it('allows only one lap infant per adult', () => {
    expect(
      validatePassengerAges(
        [
          { passengerType: 'ADULT', birthDate: '1990-01-01' },
          { passengerType: 'INFANT', birthDate: '2025-01-01' },
          { passengerType: 'INFANT', birthDate: '2025-02-01' },
        ],
        '2026-08-10T10:00:00.000Z',
      ),
    ).toBe('TOO_MANY_LAP_INFANTS');
  });

  it('uses full fare for a charter child', () => {
    expect(
      passengerTotalIrr(
        '1000000',
        { adults: 1, children: 1, infants: 0 },
        true,
      ),
    ).toBe(2_000_000n);
  });

  it('does not allocate a seat to a lap infant', () => {
    expect(seatCountForMix({ adults: 2, children: 1, infants: 2 })).toBe(3);
  });

  it('builds one form card per search mix slot with per-type ordinals', () => {
    const passengers = buildPassengersFromMix({
      adults: 2,
      children: 1,
      infants: 1,
    });
    expect(passengers.map((p) => p.passengerType)).toEqual([
      'ADULT',
      'ADULT',
      'CHILD',
      'INFANT',
    ]);
    expect(passengerTypeOrdinal(passengers, 0)).toBe(1);
    expect(passengerTypeOrdinal(passengers, 1)).toBe(2);
    expect(passengerTypeOrdinal(passengers, 2)).toBe(1);
    expect(passengerTypeOrdinal(passengers, 3)).toBe(1);
  });
});
