import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../hooks/useAuth';
import SuperAdminSandboxAccess from './SuperAdminSandboxAccess';
import SandboxImpersonationBanner from './SandboxImpersonationBanner';

describe('super-admin sandbox tenant access', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('lists eligible accounts and starts an agency preview', async () => {
    const startSandboxImpersonation = vi.fn().mockResolvedValue({
      id: 'agency-1',
      fullName: 'آژانس تست',
      role: 'AGENCY',
      preferredLocale: 'FA',
      mustChangePassword: false,
      isSandboxImpersonation: true,
    });
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'owner-1',
        fullName: 'مالک',
        role: 'SITE_ADMIN',
        preferredLocale: 'FA',
        mustChangePassword: false,
        isSuperAdmin: true,
      },
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
      refreshMe: vi.fn(),
      listSandboxTenantAccounts: vi.fn().mockResolvedValue([
        { id: 'user-1', fullName: 'کاربر تست', role: 'USER', username: null },
        {
          id: 'agency-1',
          fullName: 'آژانس تست',
          role: 'AGENCY',
          username: 'agency.test',
        },
      ]),
      startSandboxImpersonation,
    });

    render(
      <MemoryRouter initialEntries={['/panel']}>
        <Routes>
          <Route path="/panel" element={<SuperAdminSandboxAccess />} />
          <Route path="/agency" element={<div>agency destination</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const button = await screen.findByRole('button', {
      name: 'ورود آزمایشی به پنل آژانس',
    });
    fireEvent.click(button);

    await waitFor(() =>
      expect(startSandboxImpersonation).toHaveBeenCalledWith('agency-1'),
    );
    expect(await screen.findByText('agency destination')).toBeInTheDocument();
  });

  it('returns an impersonated tenant session to the owner panel', async () => {
    const returnFromSandboxImpersonation = vi.fn().mockResolvedValue({
      id: 'owner-1',
      fullName: 'مالک',
      role: 'SITE_ADMIN',
      preferredLocale: 'FA',
      mustChangePassword: false,
      isSuperAdmin: true,
    });
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'user-1',
        fullName: 'کاربر تست',
        role: 'USER',
        preferredLocale: 'FA',
        mustChangePassword: false,
        isSandboxImpersonation: true,
      },
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
      refreshMe: vi.fn(),
      returnFromSandboxImpersonation,
    });

    render(
      <MemoryRouter initialEntries={['/account']}>
        <SandboxImpersonationBanner />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'بازگشت به سوپر ادمین' }),
    );
    await waitFor(() =>
      expect(returnFromSandboxImpersonation).toHaveBeenCalledTimes(1),
    );
  });
});
