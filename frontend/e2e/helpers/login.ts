import type { Page } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';
export const STAFF_PASSWORD = 'Blujet@1404';

export async function getTwoFactorCode(username: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/_test/last-code/${username}`);
  const body = (await res.json()) as { success: boolean; data?: { code: string } };
  if (!body.success || !body.data) throw new Error(`No 2FA code available for ${username}`);
  return body.data.code;
}

/**
 * Full username/password + 2FA login. The auth endpoints keep their
 * production-shaped 5/min rate limit even in dev and every E2E test logs in
 * once against the same persistent dev server, so on a 429 this waits out
 * part of the throttle window and retries instead of failing the test.
 * Specs using it should set a generous test timeout (240s covers the worst
 * case of several waits).
 */
export const AGENCY_GOLD_PHONE = '+989120000002';

/**
 * Agency Portal login: phone+password, no 2FA step (unlike staff login).
 * Uses the seed's gold agency by default, which carries the shared
 * STAFF_PASSWORD dev password like every other seeded account.
 */
export async function loginAsAgency(page: Page, phone = AGENCY_GOLD_PHONE, password = STAFF_PASSWORD) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.goto('/agency/login');
    await page.fill('#phone', phone);
    await page.fill('#password', password);
    const [loginRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/auth/agency/login') && r.request().method() === 'POST'),
      page.click('button[type=submit]'),
    ]);
    if (loginRes.status() === 429) {
      await page.waitForTimeout(21_000);
      continue;
    }
    await page.waitForURL('**/agency');
    return;
  }
  throw new Error(`agency login for ${phone} kept hitting the rate limit`);
}

export async function loginAs(page: Page, username: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.goto('/login');
    await page.fill('#username', username);
    // The username-mode lookup is deliberately best-effort in the UI: a
    // network/rate-limit failure still advances established users to the
    // password phase. Waiting for a response here can therefore deadlock the
    // test after the UI has already advanced without receiving one.
    await page.getByRole('button', { name: 'ادامه', exact: true }).click();
    await page.locator('#password').waitFor({ state: 'visible' });
    await page.fill('#password', STAFF_PASSWORD);
    const [loginRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/auth\/staff\/login$/.test(new URL(r.url()).pathname) &&
          r.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'ارسال کد یک‌بارمصرف', exact: true }).click(),
    ]);
    if (loginRes.status() === 429) {
      await page.waitForTimeout(21_000);
      continue;
    }
    const loginBody = (await loginRes.json()) as {
      data?: { loginMode?: string };
    };
    if (loginBody.data?.loginMode !== 'TWO_FACTOR') {
      await page.waitForURL('**/panel');
      return;
    }
    await page.waitForURL('**/two-factor');
    const code = await getTwoFactorCode(username);
    await page.fill('#code', code);
    const [verifyRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/auth\/staff\/login\/verify$/.test(new URL(r.url()).pathname) &&
          r.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.click('button[type=submit]'),
    ]);
    if (verifyRes.status() === 429) {
      await page.waitForTimeout(21_000);
      continue;
    }
    await page.waitForURL('**/panel');
    return;
  }
  throw new Error(`login for ${username} kept hitting the rate limit`);
}
