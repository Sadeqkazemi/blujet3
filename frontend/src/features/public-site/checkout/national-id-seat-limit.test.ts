import { describe, expect, it } from 'vitest';
import { nationalIdsExceedingSeatLimit } from './national-id-seat-limit';
import { emptyPassenger } from './checkout-types';

describe('nationalIdsExceedingSeatLimit', () => {
  const passenger = (extraSeatRequested = false) => ({
    nationalId: '0012345679',
    docType: 'NATIONAL_ID' as const,
    passengerType: 'ADULT' as const,
    extraSeatRequested,
  });

  it('keeps an adjacent EXST attached to its passenger identity', () => {
    expect(nationalIdsExceedingSeatLimit([passenger(true)])).toEqual([]);
    expect(nationalIdsExceedingSeatLimit([passenger(true), passenger(false)])).toEqual([
      '0012345679',
    ]);
  });
  it('rejects two passenger rows with the same national ID', () => {
    const a = {
      ...emptyPassenger(''),
      nationalId: '0012345679',
      docType: 'NATIONAL_ID' as const,
    };
    const b = {
      ...emptyPassenger(''),
      nationalId: '0012345679',
      docType: 'NATIONAL_ID' as const,
    };
    expect(nationalIdsExceedingSeatLimit([a, b])).toEqual(['0012345679']);
  });

  it('rejects any additional passenger with the same national ID', () => {
    const rows = [1, 2, 3].map(() => ({
      ...emptyPassenger(''),
      nationalId: '0012345679',
      docType: 'NATIONAL_ID' as const,
    }));
    expect(nationalIdsExceedingSeatLimit(rows)).toEqual(['0012345679']);
  });

  it('counts infant identities but ignores passport-only rows', () => {
    const adult = {
      ...emptyPassenger(''),
      nationalId: '0012345679',
      docType: 'NATIONAL_ID' as const,
    };
    const infant = {
      ...emptyPassenger(''),
      nationalId: '0012345679',
      docType: 'NATIONAL_ID' as const,
      passengerType: 'INFANT' as const,
    };
    const passport = {
      ...emptyPassenger(''),
      nationalId: '',
      passportNo: 'A1234567',
      docType: 'PASSPORT' as const,
    };
    expect(nationalIdsExceedingSeatLimit([adult, infant, passport])).toEqual([
      '0012345679',
    ]);
  });
});
