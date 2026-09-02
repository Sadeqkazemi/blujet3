import * as crypto from 'node:crypto';

function key(): Buffer {
  const value = Buffer.from(process.env.PII_ENCRYPTION_KEY ?? '', 'hex');
  if (value.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY must be 32 bytes of hex');
  }
  return value;
}

export function decryptPayload(stored: string): string {
  const [ivBase64, tagBase64, encryptedBase64] = stored.split('.');
  if (!ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error('Invalid encrypted payload');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(ivBase64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function decryptProviderKey(stored: string): string {
  return decryptPayload(stored);
}
