import * as crypto from 'node:crypto';

const AGENCY_API_KEY_DOMAIN = 'blujet:agency-api-key:v2';

/**
 * Produces a deterministic, computationally expensive lookup token without
 * storing the raw API key. The server-side PII key acts as a secret salt and
 * the domain prefix prevents reuse across unrelated cryptographic contexts.
 */
export function hashAgencyApiKey(raw: string): string {
  const pepperHex = process.env.PII_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-f]{64}$/i.test(pepperHex)) {
    throw new Error(
      'PII_ENCRYPTION_KEY must be 32 bytes of hex before API keys can be used',
    );
  }

  const salt = Buffer.concat([
    Buffer.from(AGENCY_API_KEY_DOMAIN, 'utf8'),
    Buffer.from([0]),
    Buffer.from(pepperHex, 'hex'),
  ]);

  return crypto.scryptSync(raw, salt, 32).toString('hex');
}
