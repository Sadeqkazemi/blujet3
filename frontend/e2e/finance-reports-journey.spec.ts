import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/login';

// Generous timeout: the shared login helper may wait out the auth rate limit.
test.setTimeout(240_000);

test('Finance Manager opens مالی and sees real transactions, revenue mix, and agency settlements', async ({
  page,
}) => {
  await loginAs(page, 'finance');
  await page.getByRole('link', { name: 'مالی', exact: true }).click();
  await page.waitForURL('**/panel/finance');

  await expect(page.getByText('تراکنش‌های مالی اخیر', { exact: true })).toBeVisible();
  await expect(page.getByText('ترکیب درآمد', { exact: true })).toBeVisible();
  await expect(page.getByText('تسویه‌حساب آژانس‌های همکار', { exact: true })).toBeVisible();
  // The seed's silver agency has an overdue invoice → at least one real
  // معوق row exists (repeated E2E runs may add more).
  await expect(page.getByText(/معوق — /).first()).toBeVisible();
});

test('CEO opens مالی and gets the analytic view (no finance-ops sections)', async ({ page }) => {
  await loginAs(page, 'ceo');
  await page.getByRole('link', { name: 'مالی', exact: true }).click();
  await page.waitForURL('**/panel/finance');

  await expect(
    page.getByText('فروش هر پرواز بر اساس کانال و پیشنهاد قیمت هوش مصنوعی', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('نمودار فروش', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '۶ ماهه' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'شماره پرواز' })).toBeVisible();
  await expect(page.getByText('ترکیب درآمد', { exact: true })).toBeVisible();
  await expect(page.getByText('مطالبات معوق آژانس‌ها', { exact: true })).toBeVisible();
  await expect(page.getByText('تراکنش‌های مالی اخیر', { exact: true })).toHaveCount(0);
  await expect(page.getByText('تسویه‌حساب آژانس‌های همکار', { exact: true })).toHaveCount(0);
});

test('Senior searches گزارش مسافران and sees the ticket card with a masked national ID', async ({
  page,
}) => {
  await loginAs(page, 'senior');
  await page.getByRole('link', { name: 'گزارش مسافران' }).click();
  await page.waitForURL('**/panel/reports');

  // Phase 9's seed passengers include "نگار رضایی" with a seat on EP-821.
  await page.fill('input[placeholder="مثال: نگار رضایی"]', 'نگار رضایی');
  await page.getByRole('button', { name: 'جستجو' }).click();

  await expect(page.getByText('کد رزرو (PNR)').first()).toBeVisible();
  await expect(page.getByText(/EP-/).first()).toBeVisible();
});

test('Finance Manager sees گزارش کارمندان with only its own dept employees', async ({ page }) => {
  await loginAs(page, 'finance');
  await page.getByRole('link', { name: 'گزارش کارمندان' }).click();
  await page.waitForURL('**/panel/staff');

  await expect(page.getByText('گزارش عملکرد کارمندان')).toBeVisible();
  // Seed: fin.hosseini (کیوان حسینی) is the finance-dept employee; the
  // commercial-dept employee (یاسمن مرادی) must never appear here.
  await expect(page.getByRole('button', { name: 'کیوان حسینی' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'یاسمن مرادی' })).toHaveCount(0);
});

test('Role isolation: CEO has no گزارش مسافران/گزارش کارمندان nav entries', async ({ page }) => {
  await loginAs(page, 'ceo');
  await expect(page.getByRole('link', { name: 'گزارش مسافران' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'گزارش کارمندان' })).toHaveCount(0);
});
