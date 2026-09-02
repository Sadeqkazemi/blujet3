import * as crypto from 'node:crypto';
import {
  generateReferralCode,
  normalizeReferralCode,
} from './referral-code.util';

describe('referral-code.util', () => {
  it('generates CODE-#### shape', () => {
    const code = generateReferralCode('Negar Rezaei', crypto.randomUUID());
    expect(code).toMatch(/^[A-Z0-9]{3,8}-\d{4}$/);
  });

  it('normalizes referral codes to uppercase', () => {
    expect(normalizeReferralCode(' negar-4152 ')).toBe('NEGAR-4152');
  });
});
