import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/login';

// Generous timeout: the shared login helper may wait out the auth rate limit.
test.setTimeout(240_000);

/** Strips the "به‌زودی" suffix NavLink appends for not-yet-implemented tabs. */
function stripComingSoon(label: string): string {
  return label.replace(/به‌زودی$/, '').trim();
}

const ROLE_CASES = [
  {
    username: 'finance',
    roleLabel: 'مدیر مالی',
    expectedTabs: ['داشبورد', 'آژانس‌ها', 'گزارش مسافران', 'گزارش کارمندان', 'مالی', 'استرداد بلیط', 'کارتابل'],
    dashboardMarkers: ['کل درآمد', 'نمودار فروش'],
  },
  {
    username: 'ceo',
    roleLabel: 'مدیر عامل',
    expectedTabs: [
      'داشبورد',
      'مدیران',
      'مالی',
      'کارتابل',
      'مشتریان VIP',
      'نظرسنجی مسافران',
      'گزارش مدیران',
      'هواپیما',
      'تعیین قیمت بلیط',
      'دسترسی به پنل‌ها',
      'امنیت و رمز عبور',
      'لاگ و رویدادها',
    ],
    dashboardMarkers: ['آژانس فعال', 'گزارش مالی'],
  },
  {
    username: 'senior',
    roleLabel: 'مدیر ارشد',
    expectedTabs: [
      'داشبورد',
      'آژانس‌ها',
      'مدیریت پروازها',
      'مدیران و ادمین‌ها',
      'گزارش مسافران',
      'مالی',
      'کارتابل',
      'ارجاعات',
      'گزارش مدیران',
      'مشتریان VIP',
      'نظرسنجی مسافران',
      'دسترسی به پنل‌ها',
      'امنیت و رمز عبور',
      'سامانه رزرواسیون',
    ],
    dashboardMarkers: ['آژانس فعال', 'گزارش مالی'],
  },
  {
    username: 'itadmin',
    roleLabel: 'مدیر فناوری اطلاعات',
    expectedTabs: [
      'داشبورد فنی',
      'کاربران و دسترسی‌ها',
      'رمزها و امنیت',
      'سرویس‌های سایت',
      'سامانه رزرواسیون',
      'دسترسی به پنل‌ها',
      'لاگ و رویدادها',
      'نظرسنجی مسافران',
      'پشتیبان‌گیری',
      'تنظیمات سامانه',
    ],
    // Phase 8: IT's own real dashboard (service-health/os-metrics), not the
    // shared sales/KPI one the other roles get.
    dashboardMarkers: ['سلامت سرویس‌ها', 'استفاده از منابع سرور'],
  },
];

for (const { username, roleLabel, expectedTabs, dashboardMarkers } of ROLE_CASES) {
  test(`full login journey for ${username} — lands on its own dashboard with only its permitted tabs`, async ({ page }) => {
    await loginAs(page, username);

    await expect(page.getByText(roleLabel)).toBeVisible();

    const navLinks = page.locator('nav a');
    await expect(navLinks).toHaveCount(expectedTabs.length);
    const tabLabels = (await navLinks.allTextContents()).map(stripComingSoon);
    expect(tabLabels).toEqual(expectedTabs);

    for (const marker of dashboardMarkers) {
      await expect(page.getByText(marker)).toBeVisible();
    }
  });
}

// Phase 12 closed the last «به‌زودی» tab — the same click now lands on the
// real CEO security page instead of the placeholder.
test('the last formerly-"coming soon" tab (امنیت و رمز عبور) now renders its real page', async ({
  page,
}) => {
  await loginAs(page, 'ceo');
  await page.getByRole('link', { name: /^امنیت و رمز عبور/ }).click();
  await expect(page.getByText('تغییر رمز عبور من')).toBeVisible();
  await expect(page.getByText('این بخش به‌زودی راه‌اندازی می‌شود')).toHaveCount(0);
});

test('an unauthenticated visitor is redirected to /login', async ({ page }) => {
  await page.goto('/panel');
  await page.waitForURL('**/login');
});

test('the login page renders RTL', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
