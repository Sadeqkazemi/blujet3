import {
  decryptPii,
  encryptPii,
  hashPii,
  isValidIranianNationalId,
  normalizeNationalId,
  tryDecryptPii,
} from './pii-crypto';

describe('pii-crypto (unit)', () => {
  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  it('round-trips encryption and produces a different ciphertext each time (random IV)', () => {
    const a = encryptPii('0012345679');
    const b = encryptPii('0012345679');
    expect(a).not.toBe(b);
    expect(decryptPii(a)).toBe('0012345679');
    expect(decryptPii(b)).toBe('0012345679');
  });

  it('tryDecryptPii returns null for missing or undecryptable ciphertext', () => {
    expect(tryDecryptPii(null)).toBeNull();
    expect(tryDecryptPii(undefined)).toBeNull();
    expect(tryDecryptPii('not-valid-ciphertext')).toBeNull();
    expect(tryDecryptPii(encryptPii('0012345679'))).toBe('0012345679');
  });

  it('hash is deterministic for the same input and differs for different inputs', () => {
    expect(hashPii('0012345679')).toBe(hashPii('0012345679'));
    expect(hashPii('0012345679')).not.toBe(hashPii('0023456787'));
  });

  it('validates the official national-ID checksum, rejecting bad digits and repeats', () => {
    expect(isValidIranianNationalId('0012345679')).toBe(true);
    expect(isValidIranianNationalId('0012345678')).toBe(false);
    expect(isValidIranianNationalId('1111111111')).toBe(false);
    expect(isValidIranianNationalId('123')).toBe(false);
    // Persian digits normalize before validation.
    expect(isValidIranianNationalId('۰۰۱۲۳۴۵۶۷۹')).toBe(true);
  });

  it('normalizes Persian digits to Latin', () => {
    expect(normalizeNationalId(' ۰۰۱۲۳۴۵۶۷۹ ')).toBe('0012345679');
  });
});
