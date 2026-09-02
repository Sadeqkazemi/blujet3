import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers/login';

// Generous timeout: the shared login helper may wait out the auth rate limit.
test.setTimeout(300_000);

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';

async function seedRefundRequest(page: Page): Promise<{ passengerName: string }> {
  const token = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/auth/refresh`, { method: 'POST', credentials: 'include' });
    const body = (await res.json()) as { data?: { accessToken?: string } };
    return body.data?.accessToken ?? '';
  }, API_URL);
  const res = await fetch(`${API_URL}/refunds/_test/request`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('failed to seed refund request');
  const body = (await res.json()) as { data: { passengerName: string } };
  return { passengerName: body.data.passengerName };
}

test('finance journey: KPI cards → detail (شبا + penalty breakdown) → refer → pay → closed case', async ({
  page,
}) => {
  await loginAs(page, 'finance');
  const { passengerName } = await seedRefundRequest(page);

  await page.getByRole('link', { name: /^استرداد بلیط/ }).click();
  await expect(page.getByRole('heading', { name: 'استرداد بلیط' })).toBeVisible();
  await expect(page.getByText('در صف پرداخت').first()).toBeVisible();
  await expect(page.getByText('در انتظار بررسی ادمین')).toBeVisible();

  // Open the freshly seeded card.
  const card = page.locator('li', { hasText: passengerName });
  await expect(card.getByText('آمادهٔ پرداخت')).toBeVisible();
  await card.getByRole('button', { name: new RegExp(passengerName) }).click();

  // Detail modal: decrypted شبا, passenger info and the penalty breakdown.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('اطلاعات مسافر و حساب')).toBeVisible();
  await expect(dialog.getByText('IR820170000000332211009900')).toBeVisible();
  await expect(dialog.getByText('اطلاعات پرواز')).toBeVisible();
  await expect(dialog.getByText(/درصد جریمهٔ کنسلی/)).toBeVisible();
  await expect(dialog.getByText('مبلغ نهایی قابل پرداخت')).toBeVisible();

  // Refer: pick the first staffer and hand the case over — status must stay آمادهٔ پرداخت.
  await dialog.getByLabel('گیرنده ارجاع').selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'ثبت و انتقال فرآیند ارجاع' }).click();
  await expect(page.getByText(/ارجاع شد ✓/)).toBeVisible();
  await expect(card.getByText('آمادهٔ پرداخت')).toBeVisible();
  await expect(card.getByText(/ارجاع به:/)).toBeVisible();

  // Pay from the reopened modal: ledger reversal + closed case.
  await card.getByRole('button', { name: new RegExp(passengerName) }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'تأیید، واریز به شبا و بستن پرونده' }).click();
  await expect(page.getByText('تأیید، واریز وجه و بستن پرونده انجام شد ✓')).toBeVisible();
  await expect(card.getByText('پرداخت شد').first()).toBeVisible();

  // Reopening shows the closed-case banner and no further actions (replay impossible from the UI).
  await card.getByRole('button', { name: new RegExp(passengerName) }).click();
  const paidDialog = page.getByRole('dialog');
  await expect(paidDialog.getByText('پرداخت شد و پرونده بسته است ✓')).toBeVisible();
  await expect(paidDialog.getByRole('button', { name: 'تأیید، واریز به شبا و بستن پرونده' })).toHaveCount(0);
  await expect(paidDialog.getByRole('button', { name: 'ثبت و انتقال فرآیند ارجاع' })).toHaveCount(0);
});

test('Commercial Manager gets no refunds surface (role isolation)', async ({ page }) => {
  await loginAs(page, 'comm');
  await expect(page.getByRole('link', { name: /^استرداد بلیط/ })).toHaveCount(0);
});
