import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as notificationsApi from '../../api/notifications';
import * as useAuthModule from '../../hooks/useAuth';
import * as useLocaleModule from '../../hooks/useLocale';
import AgencyPortalHeader from './AgencyPortalHeader';

describe('AgencyPortalHeader language menu', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(notificationsApi, 'fetchNotifications').mockResolvedValue([]);
    vi.spyOn(
      notificationsApi,
      'fetchNotificationsUnreadCount',
    ).mockResolvedValue({ total: 0, byCategory: {} });
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'agency-1',
        fullName: 'UAT Agency',
        role: 'AGENCY',
        preferredLocale: 'FA',
      },
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });
  });

  it.each([
    ['en', 'English'],
    ['ar', 'العربية'],
  ] as const)('selects %s from a real accessible menu button', async (next, label) => {
    const setLocale = vi.fn();
    vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({
      locale: 'fa',
      setLocale,
    });
    render(
      <MemoryRouter>
        <AgencyPortalHeader
          isMobile={false}
          activeKey="dashboard"
          agencyName="UAT Agency"
          licenseNo="UAT"
          remainingIrr="1000000000"
          onSignOut={() => undefined}
        />
      </MemoryRouter>,
    );

    const toggle = screen.getByTestId('agency-lang-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(label) }),
    );
    expect(setLocale).toHaveBeenCalledWith(next);
  });
});
