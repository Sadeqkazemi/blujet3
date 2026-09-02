import * as crypto from 'node:crypto';

function key(): Buffer {
  const value = Buffer.from(process.env.PII_ENCRYPTION_KEY ?? '', 'hex');
  if (value.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY must be 32 bytes of hex');
  }
  return value;
}

export function encryptPii(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

export function tryDecryptPii(stored: string): string | null {
  try {
    const [iv, tag, encrypted] = stored.split('.');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key(),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

export function hashPii(plain: string): string {
  return crypto.createHmac('sha256', key()).update(plain).digest('hex');
}

export function normalizeNationalId(input: string): string {
  return input
    .trim()
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

export function isValidIranianNationalId(input: string): boolean {
  const value = normalizeNationalId(input);
  if (!/^\d{10}$/.test(value) || /^(\d)\1{9}$/.test(value)) return false;
  const sum = value
    .slice(0, 9)
    .split('')
    .reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  const check = Number(value[9]);
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}
