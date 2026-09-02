const DEFAULT_SANDBOX_OTP = '123456';

/** Local/test is sandbox by default. A hosted production-mode UAT must opt in
 * explicitly so deterministic OTP can never appear by accident. Automated
 * tests opt in per suite to keep established production-contract tests valid. */
export function isSandboxAuthEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.AUTH_SANDBOX_ENABLED?.trim().toLowerCase() === 'true'
  );
}

export function getSandboxOtpCode(): string {
  const configured = (
    process.env.AUTH_SANDBOX_OTP ?? process.env.DEV_FIXED_OTP_CODE
  )?.trim();
  if (!configured) return DEFAULT_SANDBOX_OTP;
  if (!/^\d{6}$/.test(configured)) {
    throw new Error('AUTH_SANDBOX_OTP must be exactly 6 digits.');
  }
  return configured;
}
