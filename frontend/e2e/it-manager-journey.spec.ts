import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/login';

// Generous timeout: the shared login helper may wait out the auth rate limit.
test.setTimeout(300_000);

test('IT Manager creates an employee, grants a permission, resets their password, then suspends them', async ({ page }) => {
  await loginAs(page, 'itadmin');
  await page.getByRole('link', { name: 'کاربران و دسترسی‌ها' }).click();
  await expect(
    page.getByRole('heading', { name: 'کاربران و حساب‌های سامانه' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'افزودن کاربر' }).click();
  const username = `e2e.${Date.now()}`;
  await page.fill('#emp-name', 'کارمند سناریوی تست');
  await page.fill('#emp-username', username);
  await page.fill('#emp-password', 'e2epass1');
  await page.getByRole('button', { name: 'مشاهدهٔ فهرست آژانس‌ها' }).click();
  await page.getByRole('button', { name: 'ایجاد حساب و اعلان به مدیر' }).click();

  await expect(page.getByRole('button', { name: 'کارمند سناریوی تست' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'کارمند سناریوی تست' }).first().click();
  await expect(page.getByText('مشاهدهٔ فهرست آژانس‌ها')).toBeVisible();

  await page.getByRole('button', { name: 'بازنشانی رمز عبور' }).click();
  await expect(page.getByText('رمز موقت تولیدشده')).toBeVisible();
  await page.getByRole('button', { name: 'بستن' }).last().click();

  // Employees list orders newest-first, so the row just created is #1 —
  // matched by name only since prior runs may have left same-named rows.
  const row = page.locator('li', { hasText: 'کارمند سناریوی تست' }).first();
  await row.getByRole('button', { name: 'تعلیق' }).click();
  await page.getByRole('button', { name: 'تعلیق حساب' }).click();
  await expect(row.getByText('مسدود')).toBeVisible();
});

test('IT Manager toggles an internal service off and back on', async ({ page }) => {
  await loginAs(page, 'itadmin');
  await page.getByRole('link', { name: 'سرویس‌های سایت' }).click();
  await expect(page.getByText('سرویس‌های داخلی سایت')).toBeVisible();

  const toggle = page.getByRole('switch', { name: 'CDN و تصاویر' });
  const wasOn = (await toggle.getAttribute('aria-checked')) === 'true';
  await toggle.click();
  await page.getByRole('button', { name: wasOn ? 'غیرفعال کن' : 'فعال کن' }).click();
  await expect(toggle).toHaveAttribute('aria-checked', String(!wasOn));
  await toggle.click();
  await page.getByRole('button', { name: wasOn ? 'فعال کن' : 'غیرفعال کن' }).click();
  await expect(toggle).toHaveAttribute('aria-checked', String(wasOn));
});

test('IT Manager triggers a backup and sees it appear with a terminal status', async ({ page }) => {
  await loginAs(page, 'itadmin');
  await page.getByRole('link', { name: 'پشتیبان‌گیری' }).click();
  await expect(page.getByRole('heading', { name: 'نسخه‌های پشتیبان' })).toBeVisible();

  await page.getByRole('button', { name: 'پشتیبان جدید' }).click();
  const firstRow = page.locator('ul li').first();
  await expect(firstRow.getByText(/موفق|ناموفق/)).toBeVisible({ timeout: 60_000 });
});

test('Non-IT role has no IT-panel nav entries (role isolation)', async ({ page }) => {
  await loginAs(page, 'ceo');
  await expect(page.getByRole('link', { name: 'کاربران و دسترسی‌ها' })).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'سرویس‌های سایت' })).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'پشتیبان‌گیری' })).not.toBeVisible();
});
