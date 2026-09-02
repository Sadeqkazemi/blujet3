import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AccountSidebar from './AccountSidebar';
import * as useLocaleModule from '../../../hooks/useLocale';

afterEach(() => vi.restoreAllMocks());

describe('AccountSidebar logout', () => {
  it('does not label the base club membership as silver in the profile box', () => {
    vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale: 'fa', setLocale: vi.fn() });
    render(
      <AccountSidebar
        tab="profile"
        onTabChange={vi.fn()}
        user={{ id: 'u1', fullName: 'نگار رضایی', role: 'USER', preferredLocale: 'FA' }}
        club={{ isMember: true, level: 'SILVER', balance: 1200 }}
        onSignOut={vi.fn()}
        isMobile={false}
      />,
    );
    expect(screen.getByText('عضو باشگاه')).toBeInTheDocument();
    expect(screen.queryByText(/نقره/)).not.toBeInTheDocument();
  });

  it('opens the localized confirmation instead of immediately signing out', async () => {
    vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale: 'fa', setLocale: vi.fn() });
    const onSignOut = vi.fn().mockResolvedValue(undefined);

    render(
      <AccountSidebar
        tab="profile"
        onTabChange={vi.fn()}
        user={{ id: 'u1', fullName: 'نگار رضایی', role: 'USER', preferredLocale: 'FA' }}
        club={{ isMember: true, level: 'GOLD', balance: 1200 }}
        onSignOut={onSignOut}
        isMobile={false}
      />,
    );

    await userEvent.click(screen.getByTestId('account-logout'));
    expect(onSignOut).not.toHaveBeenCalled();
    expect(screen.getByTestId('account-logout-confirm')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('account-logout-confirm-confirm'));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
