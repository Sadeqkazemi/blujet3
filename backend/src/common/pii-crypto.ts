import * as crypto from 'node:crypto';

/**
 * AES-256-GCM at-rest encryption for PII columns (national IDs, passports),
 * plus a deterministic HMAC hash for exact-match search over encrypted
 * fields. Key comes from PII_ENCRYPTION_KEY (validated at startup).
 * Never log inputs or outputs of these functions.
 */

function key(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY ?? '';
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    throw new Error(
      'PII_ENCRYPTION_KEY must be 32 bytes of hex (openssl rand -hex 32)',
    );
  }
  return buf;
}

export function encryptPii(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptPii(stored: string): string {
  const [ivB64, tagB64, encB64] = stored.split('.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Soft decrypt for admin list UIs — returns null if ciphertext was sealed
 * under a different key (stale seed / key rotation) instead of 500'ing. */
export function tryDecryptPii(
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  try {
    return decryptPii(stored);
  } catch {
    return null;
  }
}

/** Deterministic keyed hash — enables exact-match lookup without decryption. */
export function hashPii(plain: string): string {
  return crypto.createHmac('sha256', key()).update(plain).digest('hex');
}

/**
 * Official Iranian national-ID (کد ملی) checksum: 10 digits; the 10th is a
 * check digit over the weighted sum of the first 9 (weights 10..2, mod 11).
 */
export function isValidIranianNationalId(input: string): boolean {
  const id = input.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  if (!/^\d{10}$/.test(id)) return false;
  if (/^(\d)\1{9}$/.test(id)) return false; // all-identical digits are invalid
  const check = Number(id[9]);
  const sum = id
    .slice(0, 9)
    .split('')
    .reduce((acc, digit, idx) => acc + Number(digit) * (10 - idx), 0);
  const remainder = sum % 11;
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

/** Normalizes Persian digits to Latin before validation/storage. */
export function normalizeNationalId(input: string): string {
  return input.trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}
