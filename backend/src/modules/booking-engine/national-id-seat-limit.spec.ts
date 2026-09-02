import {
  assertInRequestNationalIdSeatLimit,
  countOccupyingNationalIdHashes,
} from './national-id-seat-limit';
import { hashPii, normalizeNationalId } from '../../common/pii-crypto';

/** Known-valid Iranian national ID used across booking/saved-pax tests. */
const VALID_NID = '0012345679';
const VALID_NID_B = '0499370899';

describe('national-id-seat-limit', () => {
  const originalKey = process.env.PII_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.PII_ENCRYPTION_KEY;
    else process.env.PII_ENCRYPTION_KEY = originalKey;
  });

  it('rejects a second passenger row with the same national ID', () => {
    expect(() =>
      assertInRequestNationalIdSeatLimit([
        { nationalId: VALID_NID, passengerType: 'ADULT' },
        { nationalId: VALID_NID, passengerType: 'ADULT' },
      ]),
    ).toThrow(/یک مسافر/);
  });

  it('allows one passenger to own one adjacent EXST without another ticket', () => {
    expect(() =>
      assertInRequestNationalIdSeatLimit([
        {
          nationalId: VALID_NID,
          passengerType: 'ADULT',
          extraSeatRequested: true,
        },
      ]),
    ).not.toThrow();
  });

  it('also rejects duplicate identity when one row is an infant', () => {
    expect(() =>
      assertInRequestNationalIdSeatLimit([
        { nationalId: VALID_NID, passengerType: 'ADULT' },
        { nationalId: VALID_NID, passengerType: 'INFANT' },
      ]),
    ).toThrow(/یک مسافر/);
  });

  it('counts distinct national IDs independently', () => {
    const counts = countOccupyingNationalIdHashes([
      { nationalId: VALID_NID, passengerType: 'ADULT' },
      { nationalId: VALID_NID_B, passengerType: 'ADULT' },
    ]);
    expect(counts.get(hashPii(normalizeNationalId(VALID_NID)))).toBe(1);
    expect(counts.get(hashPii(normalizeNationalId(VALID_NID_B)))).toBe(1);
  });
});
