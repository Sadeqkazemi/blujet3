import * as crypto from 'crypto';
import { getSandboxOtpCode, isSandboxAuthEnabled } from './sandbox-auth';

/** Issue OTP codes. In non-production, returns a fixed dev code (123456 by
 * default, overridable via DEV_FIXED_OTP_CODE) so local login never needs
 * log scraping. Production always uses cryptographically random codes. */
export function generateOtpCode(): string {
  if (isSandboxAuthEnabled()) return getSandboxOtpCode();
  if (process.env.AUTH_SANDBOX_OTP || process.env.DEV_FIXED_OTP_CODE) {
    throw new Error(
      'A fixed OTP is configured while AUTH_SANDBOX_ENABLED is disabled.',
    );
  }
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}
