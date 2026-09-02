import * as crypto from 'node:crypto';

/** Build a shareable referral code like the design's `NEGAR-4152`. */
export function generateReferralCode(fullName: string, userId: string): string {
  const latin = fullName.replace(/[^a-zA-Z]/g, '').toUpperCase();
  const prefix =
    latin.length >= 3
      ? latin.slice(0, 8)
      : userId.replace(/-/g, '').slice(0, 4).toUpperCase();
  const suffix = crypto.randomInt(1000, 9999);
  return `${prefix}-${suffix}`;
}

export function normalizeReferralCode(input: string): string {
  return input.trim().toUpperCase();
}
