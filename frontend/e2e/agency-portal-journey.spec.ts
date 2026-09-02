import { expect, test } from '@playwright/test';
import { loginAs, loginAsAgency, AGENCY_GOLD_PHONE, STAFF_PASSWORD } from './helpers/login';

// Generous timeout: the shared login helpers may wait out the auth rate limit.
test.setTimeout(240_000);

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';

/** Issues a fresh invoice for the seed's gold agency via direct API calls
 * (staff login + issue), independent of the page's own agency session —
 * avoids ever mixing two identities in one browser context. Retries on 429
 * like the page-based `loginAs`/`loginAsAgency` helpers — the login rate
 * limit is shared across the whole serial Playwright run. */
async function staffLoginViaApi(request: import('@playwright/test').APIRequestContext) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const loginRes = await request.post(`${API_URL}/auth/staff/login`, {
      data: { username: 'comm', password: STAFF_PASSWORD },
    });
    if (loginRes.status() === 429) {
      await new Promise((resolve) => setTimeout(resolve, 21_000));
      continue;
    }
    const { challengeId } = (await loginRes.json()).data as { challengeId: string };
    const codeRes = await request.get(`${API_URL}/auth/_test/last-code/comm`);
    const { code } = (await codeRes.json()).data as { code: string };
    const verifyRes = await request.post(`${API_URL}/auth/staff/login/verify`, {
      data: { challengeId, code },
    });
    if (verifyRes.status() === 429) {
      await new Promise((resolve) => setTimeout(resolve, 21_000));
      continue;
    }
    return ((await verifyRes.json()).data as { accessToken: string }).accessToken;
  }
  throw new Error('staff login via API kept hitting the rate limit');
}

async function issueFreshInvoiceForGoldAgency(request: import('@playwright/test').APIRequestContext) {
  const accessToken = await staffLoginViaApi(request);

  const listRes = await request.get(`${API_URL}/agencies`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const { agencies } = (await listRes.json()).data as { agencies: { id: string; fullName: string }[] };
  const gold = agencies.find((a) => a.fullName === 'آژانس blujet');
  if (!gold) throw new Error('seed gold agency not found');

  const amountIrr = 1_000_000 + Math.floor(Math.random() * 9_000_000) * 10;
  const issueRes = await request.post(`${API_URL}/agencies/${gold.id}/invoices`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { amountIrr, dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
  });
  const invoice = (await issueRes.json()).data as { invoiceNo: string };
  return invoice.invoiceNo;
}

test('agency logs in with phone+password (no 2FA) and sees its own dashboard KPIs', async ({ page }) => {
  await loginAsAgency(page);
  await expect(page.getByRole('heading', { name: 'داشبورد' })).toBeVisible();
  await expect(page.getByText('فروش این ماه (تومان)')).toBeVisible();
  await expect(page.getByText('مانده اعتبار (تومان)')).toBeVisible();
  await expect(page.getByRole('img', { name: 'نمودار فروش ۶ ماه اخیر' })).toBeVisible();
});

test('agency pays an unpaid invoice from the credit tab', async ({ page, request }) => {
  const invoiceNo = await issueFreshInvoiceForGoldAgency(request);

  await loginAsAgency(page);
  await page.getByRole('link', { name: 'اعتبار و مانده' }).click();
  await page.waitForURL('**/agency/credit');

  const row = page.locator('tr', { hasText: invoiceNo });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'پرداخت از اعتبار' }).click();
  await expect(row.getByText('تسویه شد')).toBeVisible();
});

test('agency sends an inbox message and sees it in the thread', async ({ page }) => {
  await loginAsAgency(page);
  await page.getByRole('link', { name: 'کارتابل و پیام‌ها' }).click();
  await page.waitForURL('**/agency/inbox');

  const message = `پیام تست ای‌توای ${Date.now()}`;
  await page.fill('input[placeholder="پیام خود را بنویسید…"]', message);
  await page.getByRole('button', { name: 'ارسال' }).click();
  await expect(page.getByText(message)).toBeVisible();
});

test('role isolation: a staff login never reaches /agency, an agency login never reaches /panel', async ({
  page,
}) => {
  await loginAs(page, 'senior');
  await page.goto('/agency');
  await page.waitForURL('**/panel');

  await page.getByRole('button', { name: 'خروج از حساب' }).click();
  await page.waitForURL('**/login');

  await loginAsAgency(page, AGENCY_GOLD_PHONE);
  await page.goto('/panel');
  await page.waitForURL('**/agency');
});
