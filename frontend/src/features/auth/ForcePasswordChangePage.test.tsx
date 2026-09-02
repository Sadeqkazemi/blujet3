import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ForcePasswordChangePage from './ForcePasswordChangePage';
import * as authApi from '../../api/auth';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';

function renderPage(user = mockAuthUserWithRole('FINANCE_MANAGER', { mustChangePassword: true })) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'authenticated',
    user,
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
  });
  return render(
    <MemoryRouter>
      <ForcePasswordChangePage />
    </MemoryRouter>,
  );
}

describe('ForcePasswordChangePage', () => {
  it('renders the forced-change form for flagged staff users', () => {
    renderPage();
    expect(screen.getByText('تغییر رمز عبور')).toBeInTheDocument();
    expect(screen.getByLabelText('رمز عبور فعلی (موقت)')).toBeInTheDocument();
  });

  it('submits the new password and refreshes the session', async () => {
    const refreshMe = vi.fn().mockResolvedValue(mockAuthUserWithRole('FINANCE_MANAGER', { mustChangePassword: false }));
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockAuthUserWithRole('FINANCE_MANAGER', { mustChangePassword: true }),
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
      refreshMe,
      requestOtp: vi.fn(),
      verifyOtp: vi.fn(),
      passwordLogin: vi.fn(),
      requestPasswordResetEmail: vi.fn(),
      verifyPasswordResetEmail: vi.fn(),
    });
    const change = vi.spyOn(authApi, 'changeOwnPassword').mockResolvedValue({ changed: true });

    render(
      <MemoryRouter>
        <ForcePasswordChangePage />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText('رمز عبور فعلی (موقت)'), 'temp-pass');
    await userEvent.type(screen.getByLabelText('رمز عبور جدید'), 'new-pass-1');
    await userEvent.type(screen.getByLabelText('تکرار رمز عبور جدید'), 'new-pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'ذخیره و ورود به سامانه' }));

    expect(change).toHaveBeenCalledWith('temp-pass', 'new-pass-1');
    expect(refreshMe).toHaveBeenCalled();
  });
});
