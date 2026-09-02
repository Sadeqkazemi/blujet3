import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgencyLoginPage from './AgencyLoginPage';
import * as useAuthModule from '../../hooks/useAuth';
import * as useLocaleModule from '../../hooks/useLocale';
import * as agenciesApi from '../../api/agencies';
import * as authApi from '../../api/auth';
import { ApiRequestError } from '../../api/envelope';

function mockAuth(agencyLogin = vi.fn(), signOut = vi.fn(), confirmAgencyTwoFactor = vi.fn()) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin,
    confirmAgencyTwoFactor,
    signOut,
  });
}

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('AgencyLoginPage', () => {
  it('requires and verifies an agency OTP when sandbox login returns a challenge', async () => {
    const agencyLogin = vi.fn().mockResolvedValue({ loginMode: 'TWO_FACTOR', challengeId: 'agency-challenge' });
    const confirm = vi.fn().mockResolvedValue({
      id: 'a1',
      fullName: 'آژانس تست',
      role: 'AGENCY',
      preferredLocale: 'FA',
      mustChangePassword: false,
    });
    mockAuth(agencyLogin, vi.fn(), confirm);
    render(
      <MemoryRouter>
        <AgencyLoginPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('شماره تماس آژانس'), '+989120000002');
    await user.type(screen.getByLabelText('رمز عبور'), 'Blujet@1404');
    await user.click(screen.getByRole('button', { name: 'ورود به پنل آژانس' }));
    await user.type(await screen.findByTestId('agency-login-otp'), '123456');
    await user.click(screen.getByRole('button', { name: 'تأیید و ورود به پنل' }));

    expect(confirm).toHaveBeenCalledWith('agency-challenge', '123456');
  });

  it('activates an agency first login with a chosen password in sandbox', async () => {
    vi.stubEnv('VITE_SANDBOX_AUTH', 'true');
    const requestFirst = vi
      .spyOn(authApi, 'requestAgencyFirstLogin')
      .mockResolvedValue({ challengeId: 'agency-first-challenge' });
    mockAuth();
    render(
      <MemoryRouter>
        <AgencyLoginPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('agency-first-login'));
    await user.type(screen.getByLabelText('شماره تماس آژانس'), '09121234567');
    await user.type(screen.getByTestId('agency-first-password'), 'Agency@1405');
    await user.type(screen.getByTestId('agency-first-password-confirm'), 'Agency@1405');
    await user.click(screen.getByRole('button', { name: 'ثبت و ارسال کد' }));

    expect(requestFirst).toHaveBeenCalledWith('09121234567', 'Agency@1405');
    expect(await screen.findByTestId('agency-login-otp')).toBeInTheDocument();
  });

  it('requires phone and password before submitting', async () => {
    const agencyLogin = vi.fn();
    mockAuth(agencyLogin);
    render(
      <MemoryRouter>
        <AgencyLoginPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'ورود به پنل آژانس' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('شماره تماس و رمز عبور را وارد کنید.');
    expect(agencyLogin).not.toHaveBeenCalled();
  });

  it('calls agencyLogin with phone+password, no 2FA step', async () => {
    const agencyLogin = vi.fn().mockResolvedValue({ id: 'a1', fullName: 'آژانس تست', role: 'AGENCY' });
    mockAuth(agencyLogin);
    render(
      <MemoryRouter>
        <AgencyLoginPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('شماره تماس آژانس'), '+989120000002');
    await user.type(screen.getByLabelText('رمز عبور'), 'Blujet@1404');
    await user.click(screen.getByRole('button', { name: 'ورود به پنل آژانس' }));

    expect(agencyLogin).toHaveBeenCalledWith('+989120000002', 'Blujet@1404');
  });

  it('fills the working local demo agency credentials in development', async () => {
    mockAuth();
    render(
      <MemoryRouter>
        <AgencyLoginPage />
      </MemoryRouter>,
    );

    await userEvent.setup().click(screen.getByTestId('agency-demo-login'));

    expect(screen.getByLabelText('شماره تماس آژانس')).toHaveValue('09120000002');
    expect(screen.getByLabelText('رمز عبور')).toHaveValue('Blujet@1404');
  });

  it('shows a clear localized message when login attempts are rate limited', async () => {
    const agencyLogin = vi
      .fn()
      .mockRejectedValue(new ApiRequestError('RATE_LIMITED', 'ThrottlerException: Too Many Requests', 429));
    mockAuth(agencyLogin);
    render(
      <MemoryRouter>
        <AgencyLoginPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('شماره تماس آژانس'), '09120000002');
    await user.type(screen.getByLabelText('رمز عبور'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'ورود به پنل آژانس' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'تعداد تلاش‌های ورود زیاد است؛ ۶۰ ثانیه صبر کنید و دوباره تلاش کنید.',
    );
  });

  it('signup tab: requests OTP, submits the request, shows the pending-review message', async () => {
    mockAuth();
    const requestOtp = vi
      .spyOn(agenciesApi, 'requestAgencySignupOtp')
      .mockResolvedValue({ challengeId: 'ch1' });
    const submitRequest = vi
      .spyOn(agenciesApi, 'submitAgencyRequest')
      .mockResolvedValue({ id: 'req1' });

    render(
      <MemoryRouter>
        <AgencyLoginPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'ثبت‌نام آژانس' }));

    await user.type(screen.getByLabelText('نام آژانس'), 'آژانس مسافرتی پرشین');
    await user.type(screen.getByLabelText('شماره مجوز بند ب'), 'XXXX-1234');
    await user.type(screen.getByLabelText('نام مدیر آژانس'), 'نگار رضایی');
    await user.type(screen.getByLabelText('شماره موبایل آژانس'), '09121234567');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'ثبت درخواست و دریافت کد' }));

    expect(requestOtp).toHaveBeenCalledWith('09121234567');

    await screen.findByLabelText(/کد تأیید ۶ رقمی/);
    const cells = document.querySelectorAll('input[type="tel"][maxlength="1"]');
    expect(cells.length).toBe(6);
    for (let i = 0; i < 6; i++) {
      await user.type(cells[i] as HTMLInputElement, '482913'[i]!);
    }
    await user.click(screen.getByRole('button', { name: 'تأیید و ثبت درخواست' }));

    await screen.findByText(/درخواست همکاری شما ثبت شد/);
    expect(submitRequest).toHaveBeenCalledWith({
      applicantName: 'آژانس مسافرتی پرشین',
      managerName: 'نگار رضایی',
      licenseNo: 'XXXX-1234',
      phone: '09121234567',
      challengeId: 'ch1',
      code: '482913',
    });
  });

  it('renders translated tabs and labels in English', () => {
    mockLocale('en');
    mockAuth();
    render(
      <MemoryRouter>
        <AgencyLoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Agency Phone Number')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log In to Agency Panel' })).toBeInTheDocument();
  });

  it('renders translated tabs and labels in Arabic', async () => {
    mockLocale('ar');
    mockAuth();
    render(
      <MemoryRouter>
        <AgencyLoginPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'تسجيل الوكالة' }));
    expect(screen.getByLabelText('اسم الوكالة')).toBeInTheDocument();
    expect(screen.getByLabelText('رقم الترخيص')).toBeInTheDocument();
  });

  it('forgot password: requests OTP, verifies, sets password, shows done', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    mockAuth(vi.fn(), signOut);
    const requestReset = vi
      .spyOn(authApi, 'requestAgencyPasswordReset')
      .mockResolvedValue({ challengeId: 'ch-reset' });
    const verifyReset = vi.spyOn(authApi, 'verifyAgencyPasswordReset').mockResolvedValue({
      accessToken: 'tok',
      user: { id: 'a1', fullName: 'آژانس', role: 'AGENCY', mustChangePassword: false },
    });
    const setPassword = vi.spyOn(authApi, 'setPassword').mockResolvedValue({ changed: true });

    render(
      <MemoryRouter>
        <AgencyLoginPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('agency-forgot-link'));
    expect(screen.getByTestId('agency-forgot-modal')).toBeInTheDocument();

    await user.type(screen.getByTestId('agency-forgot-phone'), '09121234567');
    await user.click(screen.getByRole('button', { name: 'ارسال کد تأیید' }));
    expect(requestReset).toHaveBeenCalledWith('09121234567');

    await user.type(screen.getByTestId('agency-forgot-code'), '482913');
    await user.click(screen.getByRole('button', { name: 'تأیید کد' }));
    expect(verifyReset).toHaveBeenCalledWith('ch-reset', '482913');

    await user.type(screen.getByTestId('agency-forgot-pass1'), 'NewPass@1404');
    await user.type(screen.getByTestId('agency-forgot-pass2'), 'NewPass@1404');
    await user.click(screen.getByRole('button', { name: 'ذخیره رمز جدید' }));

    expect(setPassword).toHaveBeenCalledWith('NewPass@1404');
    expect(signOut).toHaveBeenCalled();
    expect(await screen.findByTestId('agency-forgot-done')).toBeInTheDocument();
  });

  it('links to the separate customer sign-in page', () => {
    mockAuth();
    render(
      <MemoryRouter>
        <AgencyLoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('agency-passenger-link')).toHaveAttribute('href', '/signin');
  });
});
