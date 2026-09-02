import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers/login';

// Generous timeout: the shared login helper may wait out the auth rate limit.
test.setTimeout(300_000);

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';

async function accessToken(page: Page): Promise<string> {
  return page.evaluate(async (api) => {
    const res = await fetch(`${api}/auth/refresh`, { method: 'POST', credentials: 'include' });
    const body = (await res.json()) as { data?: { accessToken?: string } };
    return body.data?.accessToken ?? '';
  }, API_URL);
}

/** Creates a fresh, unambiguous SCHEDULED flight instance via the backend's
 * non-production test hook — the seed's own instances are a mix of past
 * "DEPARTED" bulk demo rows and one deliberately-past-dated "SCHEDULED" row
 * (a pre-existing Phase 1 seed quirk), so picking one by sorting is
 * unreliable for a date-based search test. */
async function createFreshInstanceDate(page: Page): Promise<string> {
  const token = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/auth/refresh`, { method: 'POST', credentials: 'include' });
    const body = (await res.json()) as { data?: { accessToken?: string } };
    return body.data?.accessToken ?? '';
  }, API_URL);
  const instance = await page.evaluate(
    async ({ api, token }) => {
      const res = await fetch(`${api}/reservation/_test/flight-instance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as { data?: { departureAt: string } };
      return body.data;
    },
    { api: API_URL, token },
  );
  if (!instance) throw new Error('failed to create a test flight instance');
  return instance.departureAt.slice(0, 10);
}

/** Creates a fresh SCHEDULED instance + issues a manual PNR via API so the
 * design UI (which no longer embeds seat-map / «رزرو جدید») can exercise
 * مدیریت رزروها against a known booking. */
async function issueTestPnr(page: Page, passengerName: string): Promise<string> {
  const token = await accessToken(page);
  const pnr = await page.evaluate(
    async ({ api, token, passengerName }) => {
      const fiRes = await fetch(`${api}/reservation/_test/flight-instance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const fiBody = (await fiRes.json()) as {
        data?: { id: string; seats?: string[] };
        success?: boolean;
      };
      const flightInstanceId = fiBody.data?.id;
      if (!flightInstanceId) throw new Error('failed to create test flight instance');

      const mapRes = await fetch(`${api}/reservation/seatmap/${flightInstanceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const mapBody = (await mapRes.json()) as {
        data?: { rows: { seats: { seatCode: string; status: string }[] }[] };
      };
      const free = mapBody.data?.rows
        .flatMap((r) => r.seats)
        .find((s) => s.status === 'FREE')?.seatCode;
      if (!free) throw new Error('no free seat on test instance');

      const issueRes = await fetch(`${api}/reservation/pnr`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flightInstanceId,
          seatCode: free,
          passengerName,
        }),
      });
      const issueBody = (await issueRes.json()) as { data?: { pnr: string } };
      if (!issueBody.data?.pnr) throw new Error(`issue failed: ${JSON.stringify(issueBody)}`);
      return issueBody.data.pnr;
    },
    { api: API_URL, token, passengerName },
  );
  return pnr;
}

test('IT Manager sees the design four-tab reservation shell', async ({ page }) => {
  await loginAs(page, 'itadmin');
  await page.getByRole('link', { name: 'سامانه رزرواسیون' }).click();
  await expect(page.getByRole('heading', { name: 'سامانه رزرواسیون پرواز' })).toBeVisible();

  await expect(page.getByRole('button', { name: /داشبورد/ })).toBeVisible();
  await expect(page.getByText('وضعیت سرویس‌های سامانه')).toBeVisible();

  await page.getByRole('button', { name: /مدیریت رزروها/ }).click();
  await expect(page.getByText('جستجوی رزرو')).toBeVisible();
  await expect(page.getByText('آخرین رزروهای ثبت‌شده')).toBeVisible();

  await page.getByRole('button', { name: /دسترسی آژانس‌ها/ }).click();
  await expect(
    page.getByText(/آژانس|آژانسی با دسترسی API ثبت نشده است/).first(),
  ).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: /پروازها/ }).click();
  await expect(page.getByPlaceholder('جستجوی پرواز - مسیر یا شماره پرواز')).toBeVisible();
});

test('IT Manager finds an issued PNR in مدیریت رزروها and cancels it', async ({ page }) => {
  await loginAs(page, 'itadmin');
  const passengerName = `مسافر تست E2E ${Date.now()}`;
  const pnr = await issueTestPnr(page, passengerName);

  await page.getByRole('link', { name: 'سامانه رزرواسیون' }).click();
  await page.getByRole('button', { name: /مدیریت رزروها/ }).click();

  await page.fill('input[placeholder="مثلاً AS-88421"]', pnr);
  await page.getByRole('button', { name: 'جستجو' }).click();
  await expect(page.getByText(passengerName).first()).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: pnr, exact: true }).first().click();
  await page.getByRole('button', { name: 'لغو رزرو' }).click();
  await expect(page.getByText('رزرو لغو شد.')).toBeVisible();
});

test('IT Manager issues a manual PNR, finds it in PNR management, then cancels it', async ({ page }) => {
  await loginAs(page, 'itadmin');
  const date = await createFreshInstanceDate(page);

  await page.getByRole('link', { name: 'سامانه رزرواسیون' }).click();
  await page.getByRole('button', { name: 'رزرو جدید' }).click();

  await page.fill('input[placeholder="مبدأ"]', 'THR');
  await page.fill('input[placeholder="مقصد"]', 'DXB');
  await page.fill('input[placeholder="۱۴۰۵/۰۵/۱۲"]', date);
  await page.getByRole('button', { name: 'جستجو' }).click();

  await page.getByRole('button', { name: 'انتخاب صندلی' }).first().click();
  const freeSeat = page.getByRole('button', { name: '10A', exact: true });
  await freeSeat.click();
  await page.fill('#seat-pname', 'مسافر تست E2E');
  await page.getByRole('button', { name: 'صدور PNR و بلیط' }).click();
  // Capture the freshly-issued PNR from the success notice — searching by
  // passenger name matches CANCELLED leftovers from earlier runs, and a
  // cancelled booking's modal has no لغو رزرو button.
  const notice = await page.getByText(/صادر شد/).textContent();
  const pnr = /رزرو (\S+) صادر شد/.exec(notice ?? '')?.[1];
  if (!pnr) throw new Error(`could not extract the issued PNR from: ${notice}`);

  await page.getByRole('button', { name: 'مدیریت رزروها' }).click();
  await page.fill('input[placeholder="جستجو با کد PNR یا نام مسافر…"]', pnr);
  await expect(page.getByText('مسافر تست E2E').first()).toBeVisible();

  await page.getByRole('button', { name: pnr, exact: true }).click();
  await page.getByRole('button', { name: 'لغو رزرو' }).click();
  // Cancelling closes the detail modal and shows a page-level notice.
  await expect(page.getByText('رزرو لغو شد.')).toBeVisible();
});

test('BOARD_CHAIR can open PNR detail with change/cancel controls', async ({ page }) => {
  await loginAs(page, 'chair');
  const passengerName = `مسافر هیئت E2E ${Date.now()}`;
  const pnr = await issueTestPnr(page, passengerName);

  await page.getByRole('link', { name: 'هواپیما' }).click();
  await expect(page.getByRole('heading', { name: 'سامانه رزرواسیون پرواز' })).toBeVisible();
  await page.getByRole('button', { name: /مدیریت رزروها/ }).click();
  await page.fill('input[placeholder="مثلاً AS-88421"]', pnr);
  await page.getByRole('button', { name: 'جستجو' }).click();
  await page.getByRole('button', { name: pnr, exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'ثبت تغییر' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'لغو رزرو' })).toBeVisible();
});

test('BOARD_CHAIR locks a seat on the seat map, sees it reflected, then releases it', async ({ page }) => {
  await loginAs(page, 'chair');
  await page.getByRole('link', { name: 'هواپیما' }).click();
  await expect(page.getByRole('heading', { name: 'سامانه رزرواسیون' })).toBeVisible();

  await page.getByRole('button', { name: 'مدیریت رزروها' }).click();
  await expect(page.getByText('THR', { exact: false }).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /^نقشهٔ صندلی EP-/ }).first().click();

  await expect(page.getByText(/اشغال/)).toBeVisible();
  // Seat 3B is free in the seed data (3A/3C are sold, 4A is locked).
  const seat = page.getByRole('button', { name: '3B', exact: true });
  await seat.click();
  await page.getByRole('button', { name: 'لاک صندلی' }).click();
  await expect(page.getByText(/لاک شد/)).toBeVisible();

  const chip = page.getByRole('button', { name: '3B ×' });
  await expect(chip).toBeVisible();
  await chip.click();
});

test('SENIOR_MANAGER can change seat and cancel on PNR detail', async ({ page }) => {
  await loginAs(page, 'itadmin');
  const passengerName = `مسافر ارشد E2E ${Date.now()}`;
  const pnr = await issueTestPnr(page, passengerName);

  await loginAs(page, 'senior');
  await page.getByRole('link', { name: 'سامانه رزرواسیون' }).click();
  await page.getByRole('button', { name: /مدیریت رزروها/ }).click();
  await page.fill('input[placeholder="مثلاً AS-88421"]', pnr);
  await page.getByRole('button', { name: 'جستجو' }).click();
  await page.getByRole('button', { name: pnr, exact: true }).first().click();
  await expect(page.getByText(`رزرو ${pnr}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'ثبت تغییر' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'لغو رزرو' })).toBeVisible();
});

test('SENIOR_MANAGER can open seat map with lock controls enabled', async ({ page }) => {
  await loginAs(page, 'senior');
  await page.getByRole('link', { name: 'سامانه رزرواسیون' }).click();
  await page.getByRole('button', { name: 'پروازها' }).click();
  await expect(page.getByPlaceholder('جستجوی پرواز — مسیر یا شماره پرواز')).toBeVisible({
    timeout: 15000,
  });
  const row = page.locator('button').filter({ hasText: 'در حال فروش' }).first();
  if (await row.count()) {
    await row.click();
  } else {
    await page.locator('button').filter({ hasText: /THR|تهران/ }).first().click();
  }
  await expect(page.getByTestId('reservation-md80-seat-map').or(page.getByText(/اشغال/))).toBeVisible({
    timeout: 15000,
  });
  const freeSeat = page.getByRole('button', { name: /^[0-9]+[A-F]$/ }).first();
  await expect(freeSeat).toBeEnabled();
});

test('Non-reservation role has no reservation nav entry (role isolation)', async ({ page }) => {
  await loginAs(page, 'finance');
  await expect(page.getByRole('link', { name: 'سامانه رزرواسیون' })).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'هواپیما' })).not.toBeVisible();
});

test('CEO opens هواپیما, lists پروازها, and opens a seat map', async ({ page }) => {
  await loginAs(page, 'ceo');
  await page.getByRole('link', { name: 'هواپیما' }).click();
  await expect(page.getByRole('heading', { name: /سامانه رزرواسیون پرواز/ })).toBeVisible();
  await page.getByRole('button', { name: 'پروازها' }).click();
  await expect(page.getByPlaceholder('جستجوی پرواز — مسیر یا شماره پرواز')).toBeVisible();
  const row = page.locator('button').filter({ hasText: 'در حال فروش' }).first();
  if (await row.count()) {
    await row.click();
  } else {
    await page.getByRole('button', { name: 'مدیریت رزروها' }).click();
    await page.getByRole('button', { name: /^نقشهٔ صندلی/ }).first().click();
  }
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText(/آزاد|رزرو قطعی|قفل موقت/)).toBeVisible();
});
