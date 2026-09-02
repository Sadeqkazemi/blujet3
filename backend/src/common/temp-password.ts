import * as crypto from 'node:crypto';

/** Design shows a 3-segment human-readable temp password (e.g. Asx-7K29-tQ).
 * Shared by IT Manager's employee reset and the Agency Portal's onboarding —
 * always returned to the caller exactly once, never stored in plaintext. */
export function generateTempPassword(): string {
  const seg = (n: number) =>
    crypto.randomBytes(n).toString('base64url').slice(0, n);
  return `${seg(3)}-${seg(4)}-${seg(2)}`;
}
