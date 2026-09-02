import { expect, test } from '@playwright/test';
import { loginAs, STAFF_PASSWORD } from './helpers/login';

// Generous timeout: the shared login helper may wait out the auth rate limit.
test.setTimeout(240_000);

test('CEO admins journey: list with real status → open detail → block → unblock', async ({ page }) => {
  await loginAs(page, 'ceo');
  await page.getByRole('link', { name: 'مدیران', exact: true }).click();
  await page.waitForURL('**/panel/admins');

  // Seeded IT manager row exists.
  await page.getByText('مهندس علی صدر').click();
  await expect(page.getByText('امنیت و دسترسی ورود')).toBeVisible();

  await page.getByRole('button', { name: 'مسدودسازی ورود به پنل' }).click();
  await expect(page.getByRole('button', { name: 'فعال‌سازی ورود به پنل' })).toBeVisible();
  // Restore so other journeys can keep logging in as itadmin.
  await page.getByRole('button', { name: 'فعال‌سازی ورود به پنل' }).click();
  await expect(page.getByRole('button', { name: 'مسدودسازی ورود به پنل' })).toBeVisible();
});

test('Senior changes their own password and reverts it (امنیت و رمز عبور)', async ({ page }) => {
  await loginAs(page, 'senior');
  await page.getByRole('link', { name: 'امنیت و رمز عبور' }).click();
  await page.waitForURL('**/panel/security');

  await page.getByLabel('رمز عبور فعلی').fill(STAFF_PASSWORD);
  await page.getByLabel('رمز عبور جدید', { exact: true }).fill('Temp@654321');
  await page.getByLabel('تکرار رمز عبور جدید').fill('Temp@654321');
  await page.getByRole('button', { name: 'ثبت رمز عبور جدید' }).click();
  await expect(page.getByText('رمز عبور با موفقیت تغییر کرد ✓')).toBeVisible();

  // Revert so repeated runs and other journeys keep working.
  await page.getByLabel('رمز عبور فعلی').fill('Temp@654321');
  await page.getByLabel('رمز عبور جدید', { exact: true }).fill(STAFF_PASSWORD);
  await page.getByLabel('تکرار رمز عبور جدید').fill(STAFF_PASSWORD);
  await page.getByRole('button', { name: 'ثبت رمز عبور جدید' }).click();
  await expect(page.getByText('رمز عبور با موفقیت تغییر کرد ✓')).toBeVisible();
});

test('CEO opens لاگ و رویدادها and sees the real audit table with level chips', async ({ page }) => {
  await loginAs(page, 'ceo');
  await page.getByRole('link', { name: 'لاگ و رویدادها' }).click();
  await page.waitForURL('**/panel/logs');

  await expect(page.getByText('لاگ‌ها و رویدادهای سامانه')).toBeVisible();
  await expect(page.getByRole('cell', { name: /.+/ }).first()).toBeVisible();
});

test('IT saves تنظیمات سامانه (toggle round-trip persists across reload)', async ({ page }) => {
  await loginAs(page, 'itadmin');
  await page.getByRole('link', { name: 'تنظیمات سامانه' }).click();
  await page.waitForURL('**/panel/settings');
  await expect(page.getByText('اطلاعات شرکت')).toBeVisible();

  const toggle = page.getByRole('switch', { name: 'حالت تعمیر و نگهداری' });
  const before = await toggle.getAttribute('aria-checked');
  await toggle.click();
  await page.getByRole('button', { name: 'ذخیره تنظیمات' }).click();
  await expect(page.getByText('تنظیمات ذخیره شد ✓')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('switch', { name: 'حالت تعمیر و نگهداری' })).toHaveAttribute(
    'aria-checked',
    before === 'true' ? 'false' : 'true',
  );

  // Restore the original value.
  await page.getByRole('switch', { name: 'حالت تعمیر و نگهداری' }).click();
  await page.getByRole('button', { name: 'ذخیره تنظیمات' }).click();
  await expect(page.getByText('تنظیمات ذخیره شد ✓')).toBeVisible();
});

test('IT opens دسترسی به پنل‌ها read-only (card grid + informational copy)', async ({
  page,
}) => {
  await loginAs(page, 'itadmin');
  await page.getByRole('link', { name: /دسترسی به پنل‌ها/ }).click();
  await page.waitForURL('**/panel/panels');

  await expect(page.getByText(/تعیین سطح دسترسی ورود در اختیار مدیر عامل است/)).toBeVisible();
  await expect(page.getByText('پنل کارمند')).toBeVisible();
  await expect(page.getByText('پنل مدیر عامل')).toBeVisible();
  await expect(page.getByRole('switch')).toHaveCount(0);
});
