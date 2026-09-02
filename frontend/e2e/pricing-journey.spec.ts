import { expect, test, type Page } from '@playwright/test';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loginAs } from './helpers/login';

// Generous timeout: the shared login helper may wait out the auth rate limit.
test.setTimeout(300_000);

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';
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

async function seedInstance(page: Page): Promise<void> {
  const token = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/auth/refresh`, { method: 'POST', credentials: 'include' });
    const body = (await res.json()) as { data?: { accessToken?: string } };
    return body.data?.accessToken ?? '';
  }, API_URL);
  const res = await fetch(`${API_URL}/pricing/_test/flight-instance`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('failed to seed flight instance');
}

async function proposeOnFreshFlight(page: Page, tomanPrice: string): Promise<void> {
  await loginAs(page, 'comm');
  await seedInstance(page);
  await page.getByRole('link', { name: /^مدیریت پروازها/ }).click();
  await expect(page.getByText('تعیین قیمت پرواز و ارسال به مدیر عامل')).toBeVisible();

  const unpricedRow = page.locator('li', { hasText: 'قیمت‌گذاری نشده' }).last();
  await unpricedRow.getByRole('button', { name: 'تعیین قیمت' }).click();
  await page.fill('#proposed-input', tomanPrice);
  await page.fill('#legal-input', '4200000');
  await page.fill('#note-input', 'پیشنهاد آزمایشی E2E');
  await page.getByRole('button', { name: 'ارسال نرخ پیشنهادی برای تأیید مدیر عامل' }).click();
  await expect(page.getByText('نرخ پیشنهادی برای تأیید به مدیر عامل ارسال شد ✓')).toBeVisible();
  await expect(page.getByText('در انتظار تأیید مدیر عامل').first()).toBeVisible();
}

test.describe.serial('pricing', () => {
  test('ml-service down: CEO AI button degrades gracefully; register-by-proposed still works', async ({ page }) => {
    // Make sure nothing is listening on :8000.
    try {
      execSync('pkill -f "uvicorn app.main:app" 2>/dev/null || true');
    } catch {
      /* no process to kill */
    }
    await expect.poll(mlServiceUp, { timeout: 10_000 }).toBe(false);

    await proposeOnFreshFlight(page, '3850000');

    await loginAs(page, 'ceo');
    await page.getByRole('link', { name: /^تعیین قیمت بلیط/ }).click();
    await page.getByRole('button', { name: 'تحلیل و پیشنهاد قیمت هوش مصنوعی' }).click();
    await expect(
      page.getByText('سرویس تحلیل هوش مصنوعی در دسترس نیست؛ تأیید قیمت پیشنهادی همچنان ممکن است.'),
    ).toBeVisible();

    // The design's «تأیید بازرگانی» path keeps working without AI.
    await page.getByRole('button', { name: 'تأیید بازرگانی' }).first().click();
    await expect(page.getByText('قیمت پرواز تأیید و ثبت شد ✓')).toBeVisible();
  });

  test.describe('with ml-service running', () => {
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

    test('full loop: propose → AI analysis → «ثبت با AI» → Commercial sees the locked price', async ({ page }) => {
      await proposeOnFreshFlight(page, '3900000');

      await loginAs(page, 'ceo');
      await page.getByRole('link', { name: /^تعیین قیمت بلیط/ }).click();
      await page.getByRole('button', { name: 'تحلیل و پیشنهاد قیمت هوش مصنوعی' }).click();
      await expect(
        page.getByText('تحلیل کامل هوش مصنوعی (فصل، تعطیلات و رقبا) انجام و پیشنهاد قیمت ارائه شد ✓'),
      ).toBeVisible();
      await expect(page.getByText('تحلیل کامل هوش مصنوعی').first()).toBeVisible();

      await page.getByRole('button', { name: 'ثبت با AI' }).first().click();
      await expect(page.getByText('قیمت پرواز تأیید و ثبت شد ✓')).toBeVisible();

      // Back as Commercial: the row is locked and the modal shows the locked state.
      await loginAs(page, 'comm');
      await page.getByRole('link', { name: /^مدیریت پروازها/ }).click();
      await expect(page.getByText('تأییدشده و قفل‌شده').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'قفل‌شده' }).first()).toBeDisabled();
    });
  });
});

test('Finance Manager gets no pricing surfaces (role isolation)', async ({ page }) => {
  await loginAs(page, 'finance');
  await expect(page.getByRole('link', { name: /^تعیین قیمت بلیط/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^مدیریت پروازها/ })).toHaveCount(0);
});
