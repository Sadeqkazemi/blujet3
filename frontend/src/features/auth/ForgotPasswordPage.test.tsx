import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForgotPasswordPage from './ForgotPasswordPage';
import * as useAuthModule from '../../hooks/useAuth';
import * as useLocaleModule from '../../hooks/useLocale';
import * as authApi from '../../api/auth';
import { ApiRequestError } from '../../api/envelope';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockAuth(overrides: Partial<ReturnType<typeof useAuthModule.useAuth>> = {}) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
    requestOtp: vi.fn().mockResolvedValue('challenge-1'),
    verifyOtp: vi.fn().mockResolvedValue({ id: 'u1', fullName: 'مشتری تست', role: 'USER' }),
    requestPasswordResetEmail: vi.fn().mockResolvedValue('email-challenge-1'),
    verifyPasswordResetEmail: vi.fn().mockResolvedValue({ id: 'u1', fullName: 'مشتری تست', role: 'USER' }),
    ...overrides,
  });
}

function mockLocale(locale: 'fa' | 'en' | 'ar', setLocale = vi.fn()) {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale });
  return setLocale;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

async function typeOtp(code: string) {
  for (let i = 0; i < code.length; i++) {
    await userEvent.type(screen.getByTestId(`fp-code-cell-${i}`), code[i]!);
  }
}

describe('ForgotPasswordPage', () => {
  it('walks phone → OTP → new password, calling the real endpoints, then signs out', async () => {
    const requestOtp = vi.fn().mockResolvedValue('challenge-1');
    const verifyOtp = vi.fn().mockResolvedValue({ id: 'u1', fullName: 'مشتری تست', role: 'USER' });
    const signOut = vi.fn().mockResolvedValue(undefined);
    mockAuth({ requestOtp, verifyOtp, signOut });
    const setPassword = vi.spyOn(authApi, 'setPassword').mockResolvedValue({ changed: true });

    renderPage();
    expect(screen.getByTestId('fp-stepper')).toBeInTheDocument();
    expect(screen.getByTestId('fp-visual-panel')).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('fp-id'), '09121234567');
    await userEvent.click(screen.getByTestId('fp-send'));
    expect(requestOtp).toHaveBeenCalledWith('09121234567');

    await typeOtp('482913');
    await userEvent.click(screen.getByTestId('fp-verify'));
    expect(verifyOtp).toHaveBeenCalledWith('challenge-1', '482913');

    await userEvent.type(await screen.findByTestId('fp-pass1'), 'NewSecret1');
    await userEvent.type(screen.getByTestId('fp-pass2'), 'NewSecret1');
    await userEvent.click(screen.getByTestId('fp-save'));

    expect(setPassword).toHaveBeenCalledWith('NewSecret1');
    expect(await screen.findByTestId('fp-done')).toBeInTheDocument();
    expect(signOut).toHaveBeenCalled();
    expect(screen.getByText('ورود به حساب')).toHaveAttribute('href', '/signin');
  });

  it('rejects a too-short new password before calling the API', async () => {
    mockAuth();
    const setPassword = vi.spyOn(authApi, 'setPassword');
    renderPage();

    await userEvent.type(screen.getByTestId('fp-id'), '09121234567');
    await userEvent.click(screen.getByTestId('fp-send'));
    await typeOtp('482913');
    await userEvent.click(screen.getByTestId('fp-verify'));

    await userEvent.type(await screen.findByTestId('fp-pass1'), 'short1');
    await userEvent.type(screen.getByTestId('fp-pass2'), 'short1');
    expect(screen.getByTestId('fp-save')).toBeDisabled();
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('rejects mismatched password confirmation', async () => {
    mockAuth();
    renderPage();

    await userEvent.type(screen.getByTestId('fp-id'), '09121234567');
    await userEvent.click(screen.getByTestId('fp-send'));
    await typeOtp('482913');
    await userEvent.click(screen.getByTestId('fp-verify'));

    await userEvent.type(await screen.findByTestId('fp-pass1'), 'FirstPass1');
    await userEvent.type(screen.getByTestId('fp-pass2'), 'OtherPass2');
    expect(screen.getByText('رمزها یکسان نیستند')).toBeInTheDocument();
    expect(screen.getByTestId('fp-save')).toBeDisabled();
  });

  it('shows the real error message on a wrong OTP code', async () => {
    const verifyOtp = vi.fn().mockRejectedValue(new ApiRequestError('TWO_FACTOR_INVALID', 'کد وارد شده نادرست است.', 401));
    mockAuth({ verifyOtp });
    renderPage();

    await userEvent.type(screen.getByTestId('fp-id'), '09121234567');
    await userEvent.click(screen.getByTestId('fp-send'));
    await typeOtp('000000');
    await userEvent.click(screen.getByTestId('fp-verify'));

    expect(await screen.findByText('کد وارد شده نادرست است.')).toBeInTheDocument();
  });

  it('walks the email path — request/verify/set-password use the real email endpoints', async () => {
    const requestPasswordResetEmail = vi.fn().mockResolvedValue('email-challenge-1');
    const verifyPasswordResetEmail = vi.fn().mockResolvedValue({ id: 'u1', fullName: 'مشتری تست', role: 'USER' });
    const signOut = vi.fn().mockResolvedValue(undefined);
    mockAuth({ requestPasswordResetEmail, verifyPasswordResetEmail, signOut });
    const setPassword = vi.spyOn(authApi, 'setPassword').mockResolvedValue({ changed: true });

    renderPage();
    await userEvent.click(screen.getByTestId('fp-method-email'));
    await userEvent.type(screen.getByTestId('fp-email'), 'negar@example.com');
    await userEvent.click(screen.getByTestId('fp-send'));
    expect(requestPasswordResetEmail).toHaveBeenCalledWith('negar@example.com');

    await typeOtp('482913');
    await userEvent.click(screen.getByTestId('fp-verify'));
    expect(verifyPasswordResetEmail).toHaveBeenCalledWith('email-challenge-1', '482913');

    await userEvent.type(await screen.findByTestId('fp-pass1'), 'NewSecret1');
    await userEvent.type(screen.getByTestId('fp-pass2'), 'NewSecret1');
    await userEvent.click(screen.getByTestId('fp-save'));

    expect(setPassword).toHaveBeenCalledWith('NewSecret1');
    expect(await screen.findByTestId('fp-done')).toBeInTheDocument();
    expect(signOut).toHaveBeenCalled();
  });

  it('renders translated labels and the method toggle in English', async () => {
    mockLocale('en');
    mockAuth();
    renderPage();
    expect(screen.getByText('Reset your password')).toBeInTheDocument();
    expect(screen.getByTestId('fp-method-email')).toHaveTextContent('Email');
    expect(screen.getByTestId('fp-secure-note')).toHaveTextContent('Secure connection');
    await userEvent.click(screen.getByTestId('fp-method-email'));
    expect(screen.getByText("Enter your account's verified email to receive a recovery code by email.")).toBeInTheDocument();
  });

  it('renders translated labels in Arabic', () => {
    mockLocale('ar');
    mockAuth();
    renderPage();
    expect(screen.getByText('استعادة تعيين كلمة المرور')).toBeInTheDocument();
    expect(screen.getByTestId('fp-method-phone')).toHaveTextContent('الجوال');
  });

  it('cycles locale via the header switcher', async () => {
    const setLocale = mockLocale('fa');
    mockAuth();
    renderPage();
    await userEvent.click(screen.getByTestId('fp-lang-switch'));
    expect(setLocale).toHaveBeenCalledWith('en');
  });

  it('shows password strength meter bars as the user types', async () => {
    mockAuth();
    renderPage();

    await userEvent.type(screen.getByTestId('fp-id'), '09121234567');
    await userEvent.click(screen.getByTestId('fp-send'));
    await typeOtp('482913');
    await userEvent.click(screen.getByTestId('fp-verify'));

    const pass1 = await screen.findByTestId('fp-pass1');
    await userEvent.type(pass1, 'Abcd1234!');
    expect(screen.getByTestId('fp-strength-label')).not.toHaveTextContent('قدرت رمز');
  });

  it('disables send until phone number is valid', async () => {
    mockAuth();
    renderPage();
    expect(screen.getByTestId('fp-send')).toBeDisabled();
    await userEvent.type(screen.getByTestId('fp-id'), '0912');
    expect(screen.getByTestId('fp-send')).toBeDisabled();
    await userEvent.type(screen.getByTestId('fp-id'), '1234567');
    expect(screen.getByTestId('fp-send')).not.toBeDisabled();
  });
});
