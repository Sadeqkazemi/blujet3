import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';
import { ApiRequestError } from '../../api/envelope';
import * as useAuthModule from '../../hooks/useAuth';
import * as authApi from '../../api/auth';

afterEach(() => {
  vi.restoreAllMocks();
});

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

function renderLoginJourney() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/panel" element={<div>temporary panel reached</div>} />
        <Route path="/agency" element={<div>agency panel reached</div>} />
        <Route path="/account" element={<div>customer account reached</div>} />
        <Route path="/required-password-change" element={<div>password change reached</div>} />
        <Route path="/two-factor" element={<div>two factor reached</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function continueWithUsername(username: string) {
  await userEvent.type(screen.getByLabelText('نام کاربری'), username);
  await userEvent.click(screen.getByRole('button', { name: 'ادامه' }));
}

const baseAuth = {
  status: 'unauthenticated' as const,
  user: null,
  requestLogin: vi.fn(),
  confirmTwoFactor: vi.fn(),
  agencyLogin: vi.fn(),
  signOut: vi.fn(),
  refreshMe: vi.fn(),
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  passwordLogin: vi.fn(),
  requestPasswordResetEmail: vi.fn(),
  verifyPasswordResetEmail: vi.fn(),
};

describe('LoginPage', () => {
  it('redirects an already authenticated staff session from login to its panel', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      ...baseAuth,
      status: 'authenticated',
      user: {
        id: 'commercial-1',
        fullName: 'Commercial Manager',
        role: 'COMMERCIAL_MANAGER',
        preferredLocale: 'FA',
        mustChangePassword: false,
      },
    });
    renderLoginJourney();

    expect(await screen.findByText('temporary panel reached')).toBeInTheDocument();
    expect(screen.queryByText('ورود به سامانه')).not.toBeInTheDocument();
  });

  it('redirects an authenticated session to its role-specific surface', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      ...baseAuth,
      status: 'authenticated',
      user: {
        id: 'agency-1',
        fullName: 'Agency',
        role: 'AGENCY',
        preferredLocale: 'FA',
        mustChangePassword: false,
      },
    });
    renderLoginJourney();

    expect(await screen.findByText('agency panel reached')).toBeInTheDocument();
  });

  it('runs the sandbox first-login setup before the OTP screen', async () => {
    vi.spyOn(authApi, 'resolveStaffLoginMode').mockResolvedValue({ mode: 'FIRST_LOGIN_SETUP' });
    const firstLogin = vi
      .spyOn(authApi, 'requestStaffFirstLogin')
      .mockResolvedValue({ challengeId: 'first-challenge' });
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuth);
    renderLoginJourney();

    await continueWithUsername('ceo');
    await userEvent.type(screen.getByTestId('staff-first-password'), 'Sandbox@1405');
    await userEvent.type(screen.getByTestId('staff-first-password-confirm'), 'Sandbox@1405');
    await userEvent.type(screen.getByTestId('staff-first-phone'), '09121234567');
    await userEvent.click(screen.getByRole('button', { name: 'ثبت و ارسال کد یک‌بارمصرف' }));

    expect(firstLogin).toHaveBeenCalledWith('ceo', '09121234567', 'Sandbox@1405');
    expect(await screen.findByText('two factor reached')).toBeInTheDocument();
  });

  it('enters the panel directly only for a temporary password-only response', async () => {
    const requestLogin = vi.fn().mockResolvedValue({
      loginMode: 'TEMPORARY_PASSWORD_ONLY' as const,
      accessToken: 'temporary-access-token',
      temporaryAccessExpiresAt: '2026-08-12T00:00:00.000Z',
      user: {
        id: 'uat-it',
        fullName: 'UAT IT Manager',
        role: 'IT_MANAGER' as const,
        preferredLocale: 'FA' as const,
        mustChangePassword: false,
      },
    });
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      ...baseAuth,
      requestLogin,
    });
    renderLoginJourney();

    await continueWithUsername('uat.it');
    await userEvent.type(screen.getByLabelText('رمز عبور'), 'Strong!Password7');
    await userEvent.click(screen.getByRole('button', { name: 'ارسال کد یک‌بارمصرف' }));

    expect(await screen.findByText('temporary panel reached')).toBeInTheDocument();
  });

  it('links the airline logo on the visual panel to the public home page', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuth);
    renderLoginPage();

    expect(screen.getByTestId('staff-login-home-logo')).toHaveAttribute('href', '/');
  });

  it('keeps ordinary staff on the 2FA journey', async () => {
    const requestLogin = vi.fn().mockResolvedValue({
      loginMode: 'TWO_FACTOR' as const,
      challengeId: 'challenge-1',
    });
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      ...baseAuth,
      requestLogin,
    });
    renderLoginJourney();

    await continueWithUsername('finance');
    await userEvent.type(screen.getByLabelText('رمز عبور'), 'Strong!Password7');
    await userEvent.click(screen.getByRole('button', { name: 'ارسال کد یک‌بارمصرف' }));

    expect(await screen.findByText('two factor reached')).toBeInTheDocument();
  });

  it('renders RTL with Persian labels', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuth);
    renderLoginPage();

    expect(screen.getByText('به سامانهٔ مدیریت داخلی blujet خوش آمدید')).toBeInTheDocument();
    expect(screen.getByLabelText('نام کاربری')).toBeInTheDocument();
    expect(screen.queryByLabelText('رمز عبور')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ادامه' })).toBeInTheDocument();
  });

  it('keeps the staff credential form on the left and its LTR fields left-aligned', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuth);
    renderLoginPage();

    const layout = screen.getByTestId('staff-login-layout');
    const formPanel = screen.getByTestId('staff-login-form-panel');
    const visualPanel = screen.getByTestId('staff-login-visual-panel');
    const username = screen.getByLabelText('نام کاربری');

    expect(layout).toHaveAttribute('dir', 'ltr');
    expect(formPanel.compareDocumentPosition(visualPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(username).toHaveAttribute('dir', 'ltr');
    expect(username.className).toContain('text-left');
    expect(username.className).not.toContain('text-right');
  });

  it('does not call the authentication API until the password step is submitted', async () => {
    const requestLogin = vi.fn();
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({ ...baseAuth, requestLogin });
    renderLoginPage();

    await continueWithUsername('finance');

    expect(requestLogin).not.toHaveBeenCalled();
    expect(screen.getByText('رمز عبور خود را وارد کنید')).toBeInTheDocument();
    expect(screen.getByText('finance')).toBeInTheDocument();
  });

  it('lets staff edit the username before submitting credentials', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuth);
    renderLoginPage();

    await continueWithUsername('finance');
    await userEvent.click(screen.getByRole('button', { name: 'ویرایش نام کاربری' }));

    expect(screen.getByLabelText('نام کاربری')).toHaveValue('finance');
    expect(screen.queryByLabelText('رمز عبور')).not.toBeInTheDocument();
  });

  it('shows an inline Persian validation error when submitted empty', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuth);
    renderLoginPage();

    await userEvent.click(screen.getByRole('button', { name: 'ادامه' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('نام کاربری را وارد کنید.');
  });

  it('shows the server error message when login fails', async () => {
    const requestLogin = vi.fn().mockRejectedValue(new ApiRequestError('UNAUTHORIZED', 'نام کاربری یا رمز عبور نادرست است.', 401));
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({ ...baseAuth, requestLogin });
    renderLoginPage();

    await continueWithUsername('finance');
    await userEvent.type(screen.getByLabelText('رمز عبور'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'ارسال کد یک‌بارمصرف' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('نام کاربری یا رمز عبور نادرست است.');
  });

  it('"فراموشی رمز عبور؟" shows the contact-IT toast, matching the design', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuth);
    renderLoginPage();

    await continueWithUsername('finance');
    await userEvent.click(screen.getByTestId('staff-forgot-password'));
    expect(await screen.findByTestId('staff-forgot-toast')).toHaveTextContent(
      'برای بازیابی رمز عبور، با واحد فناوری اطلاعات (مدیر IT) تماس بگیرید',
    );
  });
});
