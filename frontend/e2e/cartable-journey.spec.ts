import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/login';

// Generous timeout: the shared login helper may wait out the auth rate limit,
// and these loops log in as two roles each.
test.setTimeout(300_000);

test('message loop: CEO composes to واحد مالی → it appears in Finance’s cartable → Finance approves it', async ({
  browser,
}) => {
  const subject = `پیام تستی ${Date.now()}`;

  const ceoCtx = await browser.newContext();
  const ceoPage = await ceoCtx.newPage();
  await loginAs(ceoPage, 'ceo');
  await ceoPage.getByRole('link', { name: /^کارتابل/ }).click();
  await ceoPage.getByRole('button', { name: 'ایجاد پیام' }).click();
  await ceoPage.selectOption('#compose-dept', 'FINANCE');
  await ceoPage.fill('#compose-subject', subject);
  await ceoPage.fill('#compose-body', 'متن پیام تستی');
  await ceoPage.getByRole('button', { name: 'ارسال پیام' }).click();
  await expect(ceoPage.getByText('پیام به «واحد مالی» ارسال شد')).toBeVisible();
  await ceoCtx.close();

  const finCtx = await browser.newContext();
  const finPage = await finCtx.newPage();
  await loginAs(finPage, 'finance');
  await finPage.getByRole('link', { name: /^کارتابل/ }).click();
  const row = finPage.locator('li', { hasText: subject });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'بررسی' }).click();
  await finPage.fill('#review-note', 'دریافت شد و بررسی گردید');
  await finPage.getByRole('button', { name: 'تأیید', exact: true }).click();
  await expect(finPage.getByText('درخواست تأیید شد ✓')).toBeVisible();
  await expect(finPage.locator('li', { hasText: subject })).toHaveCount(0);
  await finCtx.close();
});

test('referral loop: Senior creates a referral to Commercial → Commercial reports via cartable → Senior closes it', async ({
  browser,
}) => {
  const title = `ارجاع تستی ${Date.now()}`;

  const seniorCtx = await browser.newContext();
  const seniorPage = await seniorCtx.newPage();
  await loginAs(seniorPage, 'senior');
  await seniorPage.getByRole('link', { name: /^ارجاعات/ }).click();
  await seniorPage.getByRole('button', { name: 'ایجاد ارجاع جدید' }).click();
  await seniorPage.fill('#ref-title', title);
  await seniorPage.fill('#ref-body', 'شرح ارجاع تستی');
  await seniorPage.getByRole('button', { name: /رضا مرادی — مدیر بازرگانی/ }).click();
  await seniorPage.getByRole('button', { name: 'ارسال ارجاع' }).click();
  await expect(seniorPage.getByText(/ارجاع به «.*» ارسال شد ✓/)).toBeVisible();

  const commCtx = await browser.newContext();
  const commPage = await commCtx.newPage();
  await loginAs(commPage, 'comm');
  await commPage.getByRole('link', { name: /^کارتابل/ }).click();
  const row = commPage.locator('li', { hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'بررسی' }).click();
  await commPage.fill('#review-note', 'گزارش من: انجام شد');
  await commPage.getByRole('button', { name: 'تأیید', exact: true }).click();
  await expect(commPage.getByText('درخواست تأیید شد ✓')).toBeVisible();
  await commCtx.close();

  // Senior sees REPORTED and closes.
  await seniorPage.getByRole('link', { name: /^داشبورد/ }).click();
  await seniorPage.getByRole('link', { name: /^ارجاعات/ }).click();
  await seniorPage.getByText(title).click();
  await expect(seniorPage.getByText('گزارش من: انجام شد')).toBeVisible();
  await seniorPage.getByRole('button', { name: 'تأیید دریافت گزارش و بستن' }).click();
  await expect(seniorPage.getByText('گزارش تأیید و ارجاع بسته شد ✓')).toBeVisible();
  await seniorCtx.close();
});

test('IT Manager has no کارتابل or ارجاعات nav entries (role isolation)', async ({ page }) => {
  await loginAs(page, 'itadmin');
  await expect(page.getByRole('link', { name: /^کارتابل/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^ارجاعات/ })).toHaveCount(0);
});
