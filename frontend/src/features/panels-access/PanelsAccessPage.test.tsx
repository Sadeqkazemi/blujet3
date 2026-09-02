import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import PanelsAccessPage from './PanelsAccessPage';
import * as panelsApi from '../../api/panels';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';
import type { PanelAccessFlag } from '../../types/panels';
import type { Role } from '../../types/auth';

const FLAGS: PanelAccessFlag[] = [
  { panelKey: 'OPERATIONS', enabled: true, updatedAt: null },
  { panelKey: 'FINANCE', enabled: true, updatedAt: null },
  { panelKey: 'IT', enabled: false, updatedAt: '2026-07-15T09:00:00.000Z' },
  { panelKey: 'SITE_ADMIN', enabled: true, updatedAt: null },
  { panelKey: 'COMMERCIAL', enabled: true, updatedAt: null },
];

function mockRole(role: Role) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'authenticated',
    user: mockAuthUserWithRole(role),
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PanelsAccessPage />
    </MemoryRouter>,
  );
}

describe('PanelsAccessPage', () => {
  it('lists the togglable panels and flips one via the real endpoint', async () => {
    mockRole('SENIOR_MANAGER');
    vi.spyOn(panelsApi, 'fetchAccessFlags').mockResolvedValue(FLAGS);
    const setSpy = vi
      .spyOn(panelsApi, 'setAccessFlag')
      .mockResolvedValue({
        panelKey: 'FINANCE',
        enabled: false,
        updatedAt: '2026-07-17T00:00:00.000Z',
      });

    renderPage();
    const financeToggle = await screen.findByRole('switch', {
      name: 'پنل مدیر مالی',
    });
    expect(financeToggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'پنل مدیر IT' })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    const user = userEvent.setup();
    await user.click(financeToggle);
    await waitFor(() => expect(setSpy).toHaveBeenCalledWith('FINANCE', false));
    expect(screen.getByRole('switch', { name: 'پنل مدیر مالی' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('IT_MANAGER gets the read-only card grid driven by access flags', async () => {
    mockRole('IT_MANAGER');
    vi.spyOn(panelsApi, 'fetchAccessFlags').mockResolvedValue(FLAGS);

    renderPage();
    expect(
      await screen.findByText(/تعیین سطح دسترسی ورود در اختیار مدیر عامل است/),
    ).toBeInTheDocument();
    expect(screen.getByText('پنل کارمند')).toBeInTheDocument();
    expect(screen.getByText('پنل مدیر IT')).toBeInTheDocument();
    expect(screen.getByTestId('it-panel-access-grid')).toHaveClass('bg-[#101827]');
    expect(
      screen.queryByRole('switch', { name: 'پنل مدیر مالی' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('it-panel-enter-پنل کارمند')).toHaveAttribute(
      'href',
      '/panel/users',
    );
    expect(screen.getByTestId('it-panel-card-پنل مدیر IT')).toHaveTextContent(
      'بدون دسترسی',
    );
  });

  it('CEO dark card grid shows status pills and flips access', async () => {
    mockRole('CEO');
    vi.spyOn(panelsApi, 'fetchAccessFlags').mockResolvedValue(FLAGS);
    const setSpy = vi
      .spyOn(panelsApi, 'setAccessFlag')
      .mockResolvedValue({
        panelKey: 'FINANCE',
        enabled: false,
        updatedAt: '2026-07-17T00:00:00.000Z',
      });

    renderPage();
    expect(
      await screen.findByText(/واحدها توسط مدیر IT مدیریت می‌شود/),
    ).toBeInTheDocument();
    expect(screen.getAllByText('دسترسی فعال').length).toBeGreaterThan(0);
    expect(screen.getByText('دسترسی مسدود')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'پنل مدیر عملیات' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('switch', { name: 'پنل مدیر مالی' }));
    await waitFor(() => expect(setSpy).toHaveBeenCalledWith('FINANCE', false));
  });
});
