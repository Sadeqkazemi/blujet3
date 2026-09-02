import { apiGet, apiPatch, apiPost, refreshAccessToken } from './http';
import { setAccessToken } from './token-store';
import { latinDigits, normalizeIranMobile } from '../lib/fa-format';
import type { AuthUser, Locale } from '../types/auth';

export interface SandboxTenantAccount {
  id: string;
  fullName: string;
  role: 'USER' | 'AGENCY';
  username: string | null;
}

function normalizePhone(phone: string) {
  return normalizeIranMobile(latinDigits(phone).replace(/\s/g, ''));
}

function normalizeOtpCode(code: string) {
  return latinDigits(code).replace(/\D/g, '');
}

export type StaffLoginResult =
  | { loginMode: 'TWO_FACTOR'; challengeId: string }
  | {
      loginMode: 'PASSWORD_ONLY';
      accessToken: string;
      user: AuthUser;
    }
  | {
      loginMode: 'TEMPORARY_PASSWORD_ONLY';
      accessToken: string;
      user: AuthUser;
      temporaryAccessExpiresAt: string;
    };

export function resolveStaffLoginMode(username: string) {
  return apiPost<{ mode: 'FIRST_LOGIN_SETUP' | 'PASSWORD' }>(
    '/auth/staff/login-mode',
    { username },
  );
}

export function requestStaffFirstLogin(
  username: string,
  phone: string,
  newPassword: string,
) {
  return apiPost<{ challengeId: string }>('/auth/staff/first-login/request', {
    username,
    phone: normalizePhone(phone),
    newPassword,
  });
}

export async function staffLogin(username: string, password: string) {
  const result = await apiPost<StaffLoginResult>('/auth/staff/login', {
    username,
    password,
  });
  if (
    result.loginMode === 'TEMPORARY_PASSWORD_ONLY' ||
    result.loginMode === 'PASSWORD_ONLY'
  ) {
    setAccessToken(result.accessToken);
  }
  return result;
}

export async function agencyLogin(phone: string, password: string) {
  const result = await apiPost<
    | { loginMode: 'TWO_FACTOR'; challengeId: string }
    | { accessToken: string; user: AuthUser }
  >('/auth/agency/login', { phone: normalizePhone(phone), password });
  if ('accessToken' in result) setAccessToken(result.accessToken);
  return result;
}

export function requestAgencyFirstLogin(phone: string, newPassword: string) {
  return apiPost<{ challengeId: string }>('/auth/agency/first-login/request', {
    phone: normalizePhone(phone),
    newPassword,
  });
}

export async function verifyAgencyLogin(challengeId: string, code: string) {
  const result = await apiPost<{ accessToken: string; user: AuthUser }>(
    '/auth/agency/login/verify',
    { challengeId, code: normalizeOtpCode(code) },
  );
  setAccessToken(result.accessToken);
  return result;
}

export async function verifyTwoFactor(challengeId: string, code: string) {
  const result = await apiPost<{ accessToken: string; user: AuthUser }>('/auth/staff/login/verify', {
    challengeId,
    code,
  });
  setAccessToken(result.accessToken);
  return result;
}

export async function refreshSession() {
  // Routed through the same deduped in-flight request the API-retry
  // interceptor uses (see http.ts) instead of posting directly — firing a
  // second, independent /auth/refresh here would race the interceptor's
  // (or another concurrent caller's) request for the same not-yet-rotated
  // refresh-token cookie, which the backend's reuse-detection treats as a
  // stolen-token replay and revokes the whole session for.
  const ok = await refreshAccessToken();
  if (!ok) {
    throw new Error('refresh failed');
  }
}

export async function logout() {
  try {
    await apiPost('/auth/logout');
  } finally {
    setAccessToken(null);
  }
}

export function fetchMe() {
  return apiGet<AuthUser>('/auth/me');
}

export function fetchSandboxTenantAccounts() {
  return apiGet<SandboxTenantAccount[]>('/auth/sandbox/tenant-accounts');
}

export async function startSandboxImpersonation(targetUserId: string) {
  const result = await apiPost<{ accessToken: string; user: AuthUser }>(
    '/auth/sandbox/impersonate',
    { targetUserId },
  );
  setAccessToken(result.accessToken);
  return result;
}

export function updateMyLocale(locale: Locale) {
  return apiPatch<{ preferredLocale: Locale }>('/auth/me/locale', { locale });
}

export function requestOtp(phone: string) {
  return apiPost<{ challengeId: string }>('/auth/otp/request', { phone: normalizePhone(phone) });
}

/** Dev/E2E only — reads the mock OTP after requestOtp (404 in production). */
export function fetchDevLastOtp(phone: string) {
  return apiGet<{ code: string }>(`/auth/_test/last-otp/${encodeURIComponent(normalizePhone(phone))}`);
}

export type StepUpScope =
  | 'ADMIN_ROLE_CHANGE'
  | 'API_KEY_ROTATE'
  | 'REFUND_PAYOUT'
  | 'PRICE_CAPACITY_CHANGE'
  | 'SESSION_REVOKE';

export function requestStepUp(scope: StepUpScope) {
  return apiPost<{ challengeId: string }>('/auth/step-up/request', { scope });
}

export async function verifyOtp(challengeId: string, code: string) {
  const result = await apiPost<{ accessToken: string; user: AuthUser }>('/auth/otp/verify', {
    challengeId,
    code: normalizeOtpCode(code),
  });
  setAccessToken(result.accessToken);
  return result;
}

/** فراموشی رمز — sets a new password once the caller is already
 * authenticated via OTP; no current password required. */
export function setPassword(newPassword: string) {
  return apiPost<{ changed: boolean }>('/auth/set-password', { newPassword });
}

export function changeOwnPassword(currentPassword: string, newPassword: string) {
  return apiPost<{ changed: boolean }>('/auth/change-password', { currentPassword, newPassword });
}

/** فراموشی رمز — email path (Phase 51): an alternative to phone+SMS OTP for
 * customers whose account has a verified email. */
export function requestPasswordResetEmail(email: string) {
  return apiPost<{ challengeId: string }>('/auth/password-reset/email/request', { email });
}

export async function verifyPasswordResetEmail(challengeId: string, code: string) {
  const result = await apiPost<{ accessToken: string; user: AuthUser }>('/auth/password-reset/email/verify', {
    challengeId,
    code,
  });
  setAccessToken(result.accessToken);
  return result;
}

export async function customerPasswordLogin(phone: string, password: string) {
  const result = await apiPost<{ accessToken: string; user: AuthUser }>('/auth/customer/login-password', {
    phone: normalizePhone(phone),
    password,
  });
  setAccessToken(result.accessToken);
  return result;
}

/** Agency forgot-password — step 1: SMS OTP to the agency account phone. */
export function requestAgencyPasswordReset(phone: string) {
  return apiPost<{ challengeId: string }>('/auth/agency/password-reset/request', { phone: normalizePhone(phone) });
}

/** Agency forgot-password — step 2: verify OTP and issue a short-lived token for set-password. */
export async function verifyAgencyPasswordReset(challengeId: string, code: string) {
  const result = await apiPost<{ accessToken: string; user: AuthUser }>(
    '/auth/agency/password-reset/verify',
    { challengeId, code },
  );
  setAccessToken(result.accessToken);
  return result;
}
