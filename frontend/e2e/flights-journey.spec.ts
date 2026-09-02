import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loginAs } from './helpers/login';

// Generous timeout: the shared login helper may wait out the auth rate limit.
test.setTimeout(300_000);

const ML_URL = 'http://localhost:8000';
const ML_DIR = '/home/user/blujet2/ml-service';

async function mlServiceUp(): Promise<boolean> {
  try {
    const res = await fetch(`${ML_URL}/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Jalali YYYY/MM/DD for `daysAhead` days from now (Latin digits, as the form accepts). */
function jalaliDate(daysAhead: number): string {
  const date = new Date(Date.now() + daysAhead * 24 * 3_600_000);
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value.replace(/\D/g, '') ?? '';
  return `${get('year')}/${get('month')}/${get('day')}`;
}

function uniqueFlightNo(): string {
  return `PW-${(Date.now() % 9000) + 1000}`;
}

async function addFlight(
  page: import('@playwright/test').Page,
  flightNo: string,
  daysAhead: number,
) {
  await page.getByRole('button', { name: '+ افزودن پرواز' }).click();
  const dialog = page.getByRole('dialog', { name: 'افزودن پرواز جدید' });
  await dialog.getByLabel('مبدأ').selectOption('THR');
  await dialog.getByLabel('مقصد').selectOption('MHD');
  await dialog.getByLabel('شماره پرواز').fill(flightNo);
  await dialog.getByLabel('تاریخ (جلالی)').fill(jalaliDate(daysAhead));
  await dialog.getByLabel('ساعت').fill('08:30');
  await dialog.getByLabel('ظرفیت (صندلی)').fill('180');
  await dialog.getByLabel('قیمت بلیط (تومان)').fill('2500000');
  await dialog.getByRole('button', { name: 'افزودن پرواز' }).click();
  await expect(page.getByText('پرواز جدید «تهران ← مشهد» اضافه شد ✓')).toBeVisible();
}

test('Senior adds a flight via the modal, sees it in پروازهای فعال and opens its detail modal', async ({
  page,
}) => {
  await loginAs(page, 'senior');
  await page.getByRole('link', { name: /^مدیریت پروازها/ }).click();
  await expect(page.getByRole('heading', { name: 'مدیریت پروازها' })).toBeVisible();
  await expect(page.getByText('میانگین ضریب اشغال')).toBeVisible();

  const flightNo = uniqueFlightNo();
  await addFlight(page, flightNo, 2); // within the 7-day window → active list

  const row = page.locator('li', { hasText: flightNo });
  await expect(row.getByText('فعال', { exact: true })).toBeVisible();

  await row.getByText(flightNo).click();
  const dialog = page.getByRole('dialog', { name: new RegExp(flightNo) });
  await expect(dialog.getByText('تفکیک کانال فروش صندلی')).toBeVisible();
  await expect(dialog.getByText('مجموع درآمد پرواز')).toBeVisible();
  await dialog.getByRole('button', { name: 'بستن' }).click();
});

test.describe.serial('future flights with the real ml-service', () => {
  let ml: ChildProcess;

  test.beforeAll(async () => {
    // The project venv (gitignored, pyproject requires Python >=3.12) wins
    // over whatever `python3` happens to be on PATH.
    const python = existsSync(`${ML_DIR}/.venv/bin/python`) ? `${ML_DIR}/.venv/bin/python` : 'python3';
    ml = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--port', '8000'], {
      cwd: ML_DIR,
      env: { ...process.env, INTERNAL_TOKEN: 'dev-internal-token' },
      stdio: 'ignore',
      detached: false,
    });
    await expect.poll(mlServiceUp, { timeout: 30_000 }).toBe(true);
  });

  test.afterAll(() => {
    ml?.kill();
  });

  test('Commercial: new future flight → AI analysis → نرخ‌گذاری with the AI price → Phase 6 proposal pending', async ({
    page,
  }) => {
    await loginAs(page, 'comm');
    await page.getByRole('link', { name: /^مدیریت پروازها/ }).click();

    const flightNo = uniqueFlightNo();
    await addFlight(page, flightNo, 12); // beyond the 7-day window → future list

    await page.getByRole('button', { name: 'پروازهای آینده' }).click();
    const card = page.locator('div.rounded-xl', { hasText: flightNo }).first();
    await expect(card).toBeVisible();

    await page.getByRole('button', { name: '✦ تحلیل قیمت‌گذاری با هوش مصنوعی' }).click();
    await expect(
      page.getByText('تحلیل هوش مصنوعی پروازهای آینده انجام و قیمت پیشنهادی ثبت شد ✓'),
    ).toBeVisible();

    // Expand the card: the AI panel and suggested price are there.
    await card.getByRole('button', { name: new RegExp(flightNo) }).click();
    await expect(card.getByText('تحلیل هوش مصنوعی — چرا این قیمت؟')).toBeVisible();
    await expect(card.getByText('تعیین نشده')).toBeVisible();

    // Plan with the AI price.
    await card.getByRole('button', { name: 'نرخ‌گذاری' }).click();
    const dialog = page.getByRole('dialog', { name: /نرخ‌گذاری و تخصیص/ });
    await dialog.getByRole('button', { name: 'استفاده از قیمت AI' }).click();
    await expect(dialog.getByLabel('نرخ نهایی (تومان)')).not.toHaveValue('');
    await dialog.getByLabel(/تخصیص صندلی آژانس/).fill('60');
    await dialog.getByRole('button', { name: 'ثبت نرخ و تخصیص صندلی' }).click();

    // ⚑ Commercial's save routes through Phase 6 — pending CEO approval.
    await expect(page.getByText(/برای تأیید مدیر عامل ارسال شد ✓/)).toBeVisible();
    await expect(card.getByText('ویرایش نرخ')).toBeVisible();
    await expect(card.getByText(/آژانس ۶۰ · مستقیم ۱۲۰/)).toBeVisible();

    // The embedded pricing section (fetched on mount) shows the same flight
    // awaiting the CEO after a reload.
    await page.reload();
    await expect(page.getByText('تعیین قیمت پرواز و ارسال به مدیر عامل')).toBeVisible();
    const pricingRow = page.locator('li', { hasText: flightNo });
    await expect(pricingRow.getByText('در انتظار تأیید مدیر عامل')).toBeVisible();
  });
});

// FINANCE_MANAGER's lack of a مدیریت پروازها nav entry is already proven by
// pricing-journey.spec.ts › 'Finance Manager gets no pricing surfaces'.
