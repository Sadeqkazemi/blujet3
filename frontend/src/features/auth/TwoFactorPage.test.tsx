import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import TwoFactorPage from './TwoFactorPage';
import { ApiRequestError } from '../../api/envelope';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';

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

function renderTwoFactorPage(challengeId: string | null = 'chal-1') {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/two-factor', state: challengeId ? { challengeId } : null }]}
    >
      <Routes>
        <Route path="/login" element={<div>صفحه ورود</div>} />
        <Route path="/panel" element={<div>پنل من</div>} />
        <Route path="/required-password-change" element={<div>تغییر اجباری</div>} />
        <Route path="/two-factor" element={<TwoFactorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TwoFactorPage', () => {
  it('renders after a password submit carried a challengeId — Persian labels, 6-digit code input', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuth);
    renderTwoFactorPage();

    expect(screen.getByText('تأیید هویت دومرحله‌ای')).toBeInTheDocument();
    expect(screen.getByLabelText('کد تأیید')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید و ورود' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '‹ بازگشت به ورود' })).toBeInTheDocument();
  });

  it('redirects to /login instead of rendering when no challengeId is present', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuth);
    renderTwoFactorPage(null);

    expect(await screen.findByText('صفحه ورود')).toBeInTheDocument();
    expect(screen.queryByText('تأیید هویت دومرحله‌ای')).not.toBeInTheDocument();
  });

  it('shows an inline Persian validation error for an incomplete code, without calling confirmTwoFactor', async () => {
    const confirmTwoFactor = vi.fn();
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({ ...baseAuth, confirmTwoFactor });
    renderTwoFactorPage();

    await userEvent.type(screen.getByLabelText('کد تأیید'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'تأیید و ورود' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('کد ۶ رقمی را کامل وارد کنید.');
    expect(confirmTwoFactor).not.toHaveBeenCalled();
  });

  it('submits the challengeId + code and navigates to /panel on success', async () => {
    const confirmTwoFactor = vi.fn().mockResolvedValue(mockAuthUserWithRole('CEO'));
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({ ...baseAuth, confirmTwoFactor });
    renderTwoFactorPage('chal-42');

    await userEvent.type(screen.getByLabelText('کد تأیید'), '482913');
    await userEvent.click(screen.getByRole('button', { name: 'تأیید و ورود' }));

    expect(confirmTwoFactor).toHaveBeenCalledWith('chal-42', '482913');
    expect(await screen.findByText('پنل من')).toBeInTheDocument();
  });

  it('redirects to forced password change when mustChangePassword is true', async () => {
    const confirmTwoFactor = vi
      .fn()
      .mockResolvedValue(mockAuthUserWithRole('FINANCE_MANAGER', { mustChangePassword: true }));
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({ ...baseAuth, confirmTwoFactor });
    renderTwoFactorPage('chal-42');

    await userEvent.type(screen.getByLabelText('کد تأیید'), '482913');
    await userEvent.click(screen.getByRole('button', { name: 'تأیید و ورود' }));

    expect(await screen.findByText('تغییر اجباری')).toBeInTheDocument();
  });

  it('shows the server error message inline when the code is rejected', async () => {
    const confirmTwoFactor = vi
      .fn()
      .mockRejectedValue(new ApiRequestError('TWO_FACTOR_INVALID', 'کد وارد شده نادرست است.', 401));
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({ ...baseAuth, confirmTwoFactor });
    renderTwoFactorPage();

    await userEvent.type(screen.getByLabelText('کد تأیید'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'تأیید و ورود' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('کد وارد شده نادرست است.');
  });
});
