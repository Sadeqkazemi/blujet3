import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers/login';

// Generous timeout: the shared login helper may wait out the auth rate limit.
test.setTimeout(300_000);

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';

/** Seeds a fresh REFERRED request through the backend's non-production
 * test hook (request creation belongs to the site-admin/public tracks). */
async function seedRequest(page: Page, assignedTo: 'SENIOR' | 'CHAIR') {
  const token = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/auth/refresh`, { method: 'POST', credentials: 'include' });
    const body = (await res.json()) as { data?: { accessToken?: string } };
    return body.data?.accessToken ?? '';
  }, API_URL);
  const res = await fetch(`${API_URL}/club/_test/card-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ assignedTo }),
  });
  const body = (await res.json()) as { success: boolean; data: { member?: unknown } };
  if (!body.success) throw new Error('failed to seed card request');
}

test('Senior approves a senior-assigned card request; a chair-assigned one stays read-only', async ({ page }) => {
  await loginAs(page, 'senior');
  await seedRequest(page, 'SENIOR');
  await seedRequest(page, 'CHAIR');

  await page.getByRole('link', { name: /^مشتریان VIP/ }).click();
  await expect(page.getByText('درخواست‌های صدور کارت (ارجاع‌شده)')).toBeVisible();
  await expect(page.getByText('ارجاع‌شده به رئیس هیئت مدیره — در انتظار تأیید').first()).toBeVisible();

  await page.getByRole('button', { name: 'تأیید و صدور کارت' }).first().click();
  await expect(page.getByText(/کارت .* صادر شد ✓/)).toBeVisible();
});

test('Chair approves a chair-assigned request via the modal with the روند درخواست timeline', async ({ page }) => {
  await loginAs(page, 'chair');
  await seedRequest(page, 'CHAIR');

  await page.getByRole('link', { name: /^مشتریان VIP/ }).click();
  await expect(page.getByText('کل اعضای باشگاه')).toBeVisible();

  await page.getByRole('button', { name: 'بررسی درخواست' }).first().click();
  await expect(page.getByText('روند درخواست')).toBeVisible();
  await page.getByRole('button', { name: 'تأیید و صدور کارت' }).click();
  await expect(page.getByText(/کارت .* صادر شد ✓/)).toBeVisible();
});

test('CEO adds a new VIP member and finds them in the directory', async ({ page }) => {
  await loginAs(page, 'ceo');
  await page.getByRole('link', { name: /^مشتریان VIP/ }).click();
  await page.getByRole('button', { name: 'تعریف مشتری VIP جدید' }).click();

  // Checksum-valid synthetic national ID, fresh each run.
  const nid = (() => {
    for (;;) {
      const base = String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
      if (/^(\d)\1{8}$/.test(base)) continue;
      const sum = base.split('').reduce((acc, d, i) => acc + Number(d) * (10 - i), 0);
      const r = sum % 11;
      return base + String(r < 2 ? r : 11 - r);
    }
  })();

  const name = `عضو تازه ${Date.now() % 100000}`;
  await page.fill('#vip-name', name);
  await page.fill('#vip-email', `new${Date.now()}@vip.example`);
  await page.fill('#vip-nid', nid);
  // «طلایی» also exists as a directory filter chip — scope to the accordion form.
  await page.locator('#vip-add-form').getByRole('button', { name: 'طلایی' }).click();
  await page.getByRole('button', { name: 'افزودن به باشگاه' }).click();

  await expect(page.getByText(`«${name}» به باشگاه افزوده شد ✓`)).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
});

test('Finance Manager has no مشتریان VIP nav entry (role isolation)', async ({ page }) => {
  await loginAs(page, 'finance');
  await expect(page.getByRole('link', { name: /^مشتریان VIP/ })).toHaveCount(0);
});
