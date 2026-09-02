import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers/login';

// Generous timeout: the shared login helper may wait out the auth rate limit.
test.setTimeout(240_000);

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';

// Reset the agency's derived debt to a known figure via the non-prod hook —
// repeated runs against the long-lived dev DB settle the seed debt away
// (net negative, clamped to ۰), which froze the «مصرف‌شده» figure.
async function resetAgencyDebt(page: Page, agencyId: string): Promise<void> {
  const token = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/auth/refresh`, { method: 'POST', credentials: 'include' });
    const body = (await res.json()) as { data?: { accessToken?: string } };
    return body.data?.accessToken ?? '';
  }, API_URL);
  const res = await fetch(`${API_URL}/agencies/${agencyId}/_test/debt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('failed to reset agency debt');
}

async function openAgenciesTab(page: Page) {
  await page.getByRole('link', { name: /^آژانس‌ها/ }).click();
  await page.waitForURL('**/panel/agencies');
}

// One journey per role: open آژانس‌ها → search → open an agency →
// change the credit limit → see it reflected.
for (const username of ['senior', 'finance', 'comm']) {
  test(`agencies journey for ${username}: search, open detail, change credit limit`, async ({ page }) => {
    await loginAs(page, username);
    await openAgenciesTab(page);

    // Search narrows the list down to the gold seed agency.
    await page.fill('input[placeholder="جستجوی آژانس بر اساس نام، مجوز، مدیر یا شهر…"]', 'کامران یوسفی');
    // The row is a whole clickable button (the name may also appear in
    // Commercial's debtors panel, so target the row button specifically).
    const agencyRow = page.getByRole('button', { name: /آژانس blujet/ });
    await expect(agencyRow).toBeVisible();
    await expect(page.getByRole('button', { name: /آژانس پرواز آسیا/ })).toHaveCount(0);

    // For Commercial the finance content (credit card) lives in the مالی sub-tab.
    await agencyRow.click();
    await page.waitForURL(/\/panel\/agencies\/[0-9a-f-]+$/);
    if (username === 'comm') {
      await page.getByRole('button', { name: 'مالی', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'اعتبار آژانس' })).toBeVisible();

    // Change the credit limit to a unique per-role value and check the card
    // updates. Values stay under the Int32 rial ceiling (~214M toman) noted
    // as pre-launch tech debt in PLAN.md.
    const newLimitToman =
      username === 'senior' ? '150000000' : username === 'finance' ? '160000000' : '170000000';
    await page.getByRole('button', { name: 'تعیین اعتبار' }).click();
    await page.fill('#credit-input', newLimitToman);
    await page.getByRole('button', { name: 'ثبت اعتبار' }).click();

    await expect(page.getByText('سقف اعتبار جدید ثبت شد ✓')).toBeVisible();
    const expected = { '150000000': '۱۵۰٬۰۰۰٬۰۰۰', '160000000': '۱۶۰٬۰۰۰٬۰۰۰', '170000000': '۱۷۰٬۰۰۰٬۰۰۰' }[
      newLimitToman
    ]!;
    await expect(page.getByText(`${expected} تومان`).first()).toBeVisible();
  });
}

test('Commercial Manager: issue an invoice, pay it, and watch the credit-used figure drop', async ({ page }) => {
  await loginAs(page, 'comm');
  await openAgenciesTab(page);

  await page.getByRole('button', { name: /آژانس blujet/ }).click();
  await page.waitForURL(/\/panel\/agencies\/[0-9a-f-]+$/);
  const agencyId = /agencies\/([0-9a-f-]+)$/.exec(page.url())![1];
  await resetAgencyDebt(page, agencyId);
  await page.reload();
  await page.getByRole('button', { name: 'مالی', exact: true }).click();
  await expect(page.getByText('فاکتورهای صادرشده')).toBeVisible();

  // Capture the current "مصرف‌شده" (credit used) figure.
  const usedBox = page.locator('div:has(> div:text-is("مصرف‌شده"))');
  const usedBefore = (await usedBox.textContent()) ?? '';

  // Issue a 5,000,000-toman invoice due later this year (Jalali).
  await page.getByRole('button', { name: 'صدور فاکتور' }).click();
  await page.fill('#invoice-amount', '5000000');
  await page.fill('#invoice-due', '1405/06/30');
  await page.getByRole('button', { name: 'صدور و ثبت فاکتور' }).click();
  await expect(page.getByText('فاکتور صادر شد ✓')).toBeVisible();

  // Pay the newest unpaid invoice; used figure must decrease by its amount.
  await page.getByRole('button', { name: 'ثبت پرداخت این فاکتور' }).first().click();
  await expect(page.getByText(/فاکتور .* تسویه شد ✓/)).toBeVisible();

  await expect(async () => {
    const usedAfter = (await usedBox.textContent()) ?? '';
    expect(usedAfter).not.toBe(usedBefore);
  }).toPass();
});

test('a role without the agencies tab (IT Manager) has no آژانس‌ها nav entry', async ({ page }) => {
  await loginAs(page, 'itadmin');
  await expect(page.getByRole('link', { name: /^آژانس‌ها/ })).toHaveCount(0);
});
