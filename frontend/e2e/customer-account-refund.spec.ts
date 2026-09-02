import { expect, test } from '@playwright/test';
import { STAFF_PASSWORD } from './helpers/login';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';

test.setTimeout(90_000);

test('customer creates and tracks a refund from the account tab', async ({
  page,
  request,
}) => {
  await page.goto('/');

  // Create a fresh instance through the established non-production staff
  // hook. The hook guarantees a public-airport route + real seat-map type.
  const login = await request.post(`${API_URL}/auth/staff/login`, {
    data: { username: 'chair', password: STAFF_PASSWORD },
  });
  const challengeId = (await login.json()).data.challengeId as string;
  const code = (
    await (await request.get(`${API_URL}/auth/_test/last-code/chair`)).json()
  ).data.code as string;
  const verifyStaff = await request.post(
    `${API_URL}/auth/staff/login/verify`,
    { data: { challengeId, code } },
  );
  const staffToken = (await verifyStaff.json()).data.accessToken as string;
  const instanceRes = await request.post(
    `${API_URL}/reservation/_test/flight-instance`,
    { headers: { Authorization: `Bearer ${staffToken}` } },
  );
  const instance = (await instanceRes.json()).data as { id: string };

  // Log in through the real customer UI so the in-memory access token and
  // httpOnly refresh cookie are both established exactly as in production.
  const phone = `09${String(Date.now()).slice(-9)}`;
  await page.goto('/signin');
  await page.getByTestId('signin-phone').fill(phone);
  await page.getByTestId('signin-request').click();
  await expect(page.getByTestId('signin-code')).toBeVisible();
  const otp = (
    await (await request.get(`${API_URL}/auth/_test/last-otp/${phone}`)).json()
  ).data.code as string;
  await page.getByTestId('signin-code').fill(otp);
  await page.getByTestId('signin-verify').click();
  await page.waitForURL('**/');
  const customerToken = await page.evaluate(async (api) => {
    const refreshed = await fetch(`${api}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    }).then((r) => r.json());
    return refreshed.data.accessToken as string;
  }, API_URL);

  const seatMap = await request.get(
    `${API_URL}/search/flights/${instance.id}/seatmap`,
  );
  const seatData = (await seatMap.json()).data as {
    seats: {
      seatCode: string;
      status: 'FREE' | 'TAKEN';
      cabin: 'ECONOMY' | 'BUSINESS';
    }[];
  };
  const seatCode = seatData.seats.find(
    (seat) => seat.status === 'FREE' && seat.cabin === 'ECONOMY',
  )?.seatCode;
  if (!seatCode) throw new Error('fresh instance has no available seat');

  const bookingRes = await request.post(`${API_URL}/bookings`, {
    headers: { Authorization: `Bearer ${customerToken}` },
    data: {
      flightInstanceId: instance.id,
      cabin: 'ECONOMY',
      passengers: [{ fullName: 'مسافر تست استرداد حساب', seatCode }],
    },
  });
  const bookingBody = await bookingRes.json();
  expect(bookingRes.ok(), JSON.stringify(bookingBody)).toBeTruthy();
  const booking = bookingBody.data as { id: string; pnr: string };
  await request.post(`${API_URL}/bookings/${booking.id}/pay`, {
    headers: { Authorization: `Bearer ${customerToken}` },
    data: {},
  });

  await page.goto('/account');
  await page.getByTestId('account-tab-refunds').click();
  await expect(page.getByTestId('account-refunds')).toBeVisible();
  const eligible = page.getByTestId('refund-eligible').filter({
    hasText: booking.pnr,
  });
  await expect(eligible).toBeVisible();
  await eligible.getByRole('button', { name: 'درخواست استرداد' }).click();

  const dialog = page.getByRole('dialog', { name: 'ثبت درخواست استرداد' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByTestId('refund-iban')
    .fill('IR820170000000332211009900');
  await dialog.getByTestId('refund-confirm').click();

  await expect(dialog).toBeHidden();
  const tracking = page.getByTestId('refund-tracking').filter({
    hasText: booking.pnr,
  });
  await expect(tracking).toContainText('RF-');
  await expect(tracking).toContainText('ثبت درخواست');
});
