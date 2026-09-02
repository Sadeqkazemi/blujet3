import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PublicHeader from './PublicHeader';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUser, mockAuthUserLocale } from '../../test/mockAuthUser';
import * as useLocaleModule from '../../hooks/useLocale';
import * as useIsMobileModule from '../../hooks/useIsMobile';
import * as publicSiteApi from '../../api/publicSite';
import * as notificationsApi from '../../api/notifications';
import * as agencyApi from '../../api/agency-portal';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockLocale(locale: 'fa' | 'en' | 'ar' = 'fa') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

function mockCustomerNotifications(
  rows: Array<{
    id: string;
    title: string;
    body?: string;
    category?: 'SYSTEM' | 'MESSAGE' | 'REQUEST' | 'APPROVAL' | 'CARTABLE';
    entityType?: string | null;
  }> = [],
) {
  vi.spyOn(notificationsApi, 'fetchNotificationsUnreadCount').mockResolvedValue({
    total: rows.length,
    CARTABLE: 0,
    MESSAGE: 0,
    REQUEST: 0,
    APPROVAL: 0,
    SYSTEM: rows.length,
  });
  vi.spyOn(notificationsApi, 'fetchNotifications').mockResolvedValue(
    rows.map((r) => ({
      id: r.id,
      recipientId: 'u1',
      category: r.category ?? 'SYSTEM',
      action: 'INFO',
      title: r.title,
      body: r.body ?? '',
      entityType: r.entityType ?? null,
      entityId: null,
      dedupeKey: null,
      readAt: null,
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })),
  );
  vi.spyOn(notificationsApi, 'markNotificationRead').mockResolvedValue({
    id: rows[0]?.id ?? 'n1',
    recipientId: 'u1',
    category: 'SYSTEM',
    action: 'INFO',
    title: rows[0]?.title ?? '',
    body: '',
    entityType: null,
    entityId: null,
    dedupeKey: null,
    readAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  vi.spyOn(notificationsApi, 'markAllNotificationsRead').mockResolvedValue({ updated: rows.length });
}

function renderHeader(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <PublicHeader />
    </MemoryRouter>,
  );
}

describe('PublicHeader — logged-in user', () => {
  it('does not show the silver label in the customer profile header', async () => {
    mockLocale();
    mockCustomerNotifications();
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockAuthUser({ id: 'u1', fullName: 'نگار رضایی', role: 'USER' }),
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });
    vi.spyOn(publicSiteApi, 'fetchClubPoints').mockResolvedValue({ isMember: true, level: 'SILVER', balance: 10 });
    vi.spyOn(publicSiteApi, 'fetchWallet').mockResolvedValue({ balanceIrr: '0' });
    vi.spyOn(publicSiteApi, 'fetchMyProfile').mockResolvedValue({
      fullName: 'نگار رضایی', nationalId: null, birthDate: null, passportNo: null,
      email: null, emailVerifiedAt: null, completionPct: 100, profileIncomplete: false,
      missingProfileFields: [],
    });

    renderHeader();
    await waitFor(() => {
      expect(screen.getByTestId('public-user-menu-toggle')).not.toHaveTextContent('عضو باشگاه');
    });
    await userEvent.click(screen.getByTestId('public-user-menu-toggle'));
    expect(screen.getByTestId('public-user-menu')).toHaveTextContent('عضو باشگاه');
    expect(screen.queryByText('نقره‌ای')).not.toBeInTheDocument();
  });

  it('keeps an authenticated agency identity and profile menu on the public results header', async () => {
    mockLocale();
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockAuthUser({ id: 'a1', fullName: 'UAT Agency', role: 'AGENCY' }),
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });
    vi.spyOn(agencyApi, 'fetchProfile').mockResolvedValue({
      fullName: 'UAT Agency', managerName: null, licenseNo: 'B2B-42', phone: '09120000000',
      email: null, city: null, address: null, tier: null, isActive: true,
      suspendedAt: null, suspendReason: null, joinedAt: '2026-01-01T00:00:00.000Z', isTemporaryReadOnly: true,
    });
    vi.spyOn(agencyApi, 'fetchCredit').mockResolvedValue({ limitIrr: '1000000', usedIrr: '250000', remainingIrr: '750000' });

    renderHeader('/results?origin=THR&dest=MHD');

    expect(screen.getByTestId('public-agency-identity')).toHaveTextContent('UAT Agency');
    expect(screen.queryByRole('link', { name: /ورود|ثبت‌نام/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('public-agency-identity'));
    expect(await screen.findByTestId('public-agency-menu')).toHaveTextContent('B2B-42');
    expect(screen.getByRole('link', { name: 'پنل آژانس' })).toHaveAttribute('href', '/agency');
    expect(screen.getByRole('link', { name: 'پروازهای خریداری‌شده' })).toHaveAttribute('href', '/agency/sales');
  });

  it('requires confirmation before signing a customer out', async () => {
    mockLocale();
    mockCustomerNotifications();
    const signOut = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockAuthUser({ id: 'u1', fullName: 'نگار رضایی', role: 'USER' }),
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut,
    });
    vi.spyOn(publicSiteApi, 'fetchClubPoints').mockResolvedValue({ isMember: true, level: 'GOLD', balance: 12450 });
    vi.spyOn(publicSiteApi, 'fetchWallet').mockResolvedValue({ balanceIrr: '0' });
    vi.spyOn(publicSiteApi, 'fetchMyProfile').mockResolvedValue({
      fullName: 'نگار رضایی',
      nationalId: null,
      birthDate: null,
      passportNo: null,
      email: null,
      emailVerifiedAt: null,
      completionPct: 100,
      profileIncomplete: false,
      missingProfileFields: [],
    });

    renderHeader();
    await userEvent.click(screen.getByTestId('public-user-menu-toggle'));
    await userEvent.click(screen.getByTestId('public-logout'));

    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByTestId('public-logout-confirm')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('public-logout-confirm-confirm'));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('closes the sign-out confirmation even when server-side revocation fails', async () => {
    mockLocale();
    mockCustomerNotifications();
    const signOut = vi.fn().mockRejectedValue(new Error('logout endpoint unavailable'));
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockAuthUser({ id: 'u1', fullName: 'نگار رضایی', role: 'USER' }),
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut,
    });
    vi.spyOn(publicSiteApi, 'fetchClubPoints').mockResolvedValue({ isMember: true, level: 'GOLD', balance: 12450 });
    vi.spyOn(publicSiteApi, 'fetchWallet').mockResolvedValue({ balanceIrr: '0' });
    vi.spyOn(publicSiteApi, 'fetchMyProfile').mockResolvedValue({
      fullName: 'نگار رضایی',
      nationalId: null,
      birthDate: null,
      passportNo: null,
      email: null,
      emailVerifiedAt: null,
      completionPct: 100,
      profileIncomplete: false,
      missingProfileFields: [],
    });

    renderHeader();
    await userEvent.click(screen.getByTestId('public-user-menu-toggle'));
    await userEvent.click(screen.getByTestId('public-logout'));
    await userEvent.click(screen.getByTestId('public-logout-confirm-confirm'));

    expect(signOut).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByTestId('public-logout-confirm')).not.toBeInTheDocument();
    });
  });

  it('loads real notifications and marks one as read when opened', async () => {
    mockLocale();
    mockCustomerNotifications([
      {
        id: 'notif-1',
        title: 'یادآوری سفر',
        body: 'پرواز تهران → دبی شما فرداست.',
        entityType: 'BOOKING',
      },
    ]);
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockAuthUser({ id: 'u1', fullName: 'نگار رضایی', role: 'USER' }),
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });
    vi.spyOn(publicSiteApi, 'fetchClubPoints').mockResolvedValue({ isMember: true, level: 'GOLD', balance: 12450 });
    vi.spyOn(publicSiteApi, 'fetchWallet').mockResolvedValue({ balanceIrr: '0' });
    vi.spyOn(publicSiteApi, 'fetchMyProfile').mockResolvedValue({
      fullName: 'نگار رضایی',
      nationalId: null,
      birthDate: null,
      passportNo: null,
      email: null,
      emailVerifiedAt: null,
      completionPct: 100,
      profileIncomplete: false,
      missingProfileFields: [],
    });

    renderHeader();
    expect(await screen.findByTestId('public-notif-badge')).toHaveTextContent('۱');
    await userEvent.click(screen.getByTestId('public-notif-toggle'));
    expect(screen.getByTestId('public-notif-dropdown')).toBeInTheDocument();
    expect(screen.getByText('یادآوری سفر')).toBeInTheDocument();
    expect(screen.getByTestId('public-notif-new-badge')).toHaveTextContent('۱');
    await userEvent.click(screen.getByTestId('public-notif-item-notif-1'));
    await waitFor(() => {
      expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith('notif-1');
    });
  });

  it('shows the wallet balance and profile/trips links in the user menu', async () => {
    mockLocale();
    mockCustomerNotifications();
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockAuthUser({ id: 'u1', fullName: 'نگار رضایی', role: 'USER' }),
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });
    vi.spyOn(publicSiteApi, 'fetchClubPoints').mockResolvedValue({ isMember: true, level: 'GOLD', balance: 12450 });
    vi.spyOn(publicSiteApi, 'fetchWallet').mockResolvedValue({ balanceIrr: '24500000' });
    vi.spyOn(publicSiteApi, 'fetchMyProfile').mockResolvedValue({
      fullName: 'نگار رضایی',
      nationalId: null,
      birthDate: null,
      passportNo: null,
      email: null,
      emailVerifiedAt: null,
      completionPct: 100,
      profileIncomplete: false,
      missingProfileFields: [],
    });

    renderHeader();
    await userEvent.click(screen.getByTestId('public-user-menu-toggle'));
    expect(await screen.findByTestId('public-user-wallet-balance')).toHaveTextContent('۲٬۴۵۰٬۰۰۰');
    expect(screen.getByText('موجودی کل کیف پول')).toBeInTheDocument();
    expect(screen.getByText('مشاهده پروفایل')).toHaveAttribute('href', '/account');
    expect(screen.getAllByText('سفرها و خریدها')[0]).toHaveAttribute('href', '/account?tab=trips');
    expect(screen.getByText('استرداد بلیط')).toHaveAttribute('href', '/account?tab=refunds');
  });

  it('replaces a stale persistent wallet balance after a successful payment event', async () => {
    mockLocale();
    mockCustomerNotifications();
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockAuthUser({ id: 'u1', fullName: 'نگار رضایی', role: 'USER' }),
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });
    vi.spyOn(publicSiteApi, 'fetchClubPoints').mockResolvedValue({ isMember: false, level: null, balance: 0 });
    vi.spyOn(publicSiteApi, 'fetchWallet').mockResolvedValue({ balanceIrr: '100000000' });
    vi.spyOn(publicSiteApi, 'fetchMyProfile').mockResolvedValue({
      fullName: 'نگار رضایی', nationalId: null, birthDate: null, passportNo: null,
      email: null, emailVerifiedAt: null, completionPct: 100, profileIncomplete: false,
      missingProfileFields: [],
    });
    renderHeader();
    await userEvent.click(screen.getByTestId('public-user-menu-toggle'));
    expect(await screen.findByTestId('public-user-wallet-balance')).toHaveTextContent('۱۰٬۰۰۰٬۰۰۰');

    window.dispatchEvent(
      new CustomEvent('blujet:wallet-balance', {
        detail: { balanceIrr: '84000000' },
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('public-user-wallet-balance')).toHaveTextContent('۸٬۴۰۰٬۰۰۰'),
    );
  });

  it('shows English notifications and wallet balance when locale is en', async () => {
    mockLocale('en');
    mockCustomerNotifications([{ id: 'n-en', title: 'Trip reminder', body: 'Check-in is open.' }]);
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockAuthUserLocale('EN', { id: 'u1', fullName: 'Negar Rezaei', role: 'USER' }),
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });
    vi.spyOn(publicSiteApi, 'fetchClubPoints').mockResolvedValue({ isMember: true, level: 'GOLD', balance: 12450 });
    vi.spyOn(publicSiteApi, 'fetchWallet').mockResolvedValue({ balanceIrr: '24500000' });
    vi.spyOn(publicSiteApi, 'fetchMyProfile').mockResolvedValue({
      fullName: 'Negar Rezaei',
      nationalId: null,
      birthDate: null,
      passportNo: null,
      email: null,
      emailVerifiedAt: null,
      completionPct: 100,
      profileIncomplete: false,
      missingProfileFields: [],
    });

    renderHeader();
    expect(screen.getByText('Flights')).toBeInTheDocument();
    expect(await screen.findByTestId('public-notif-badge')).toHaveTextContent('1');
    await userEvent.click(screen.getByTestId('public-notif-toggle'));
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Trip reminder')).toBeInTheDocument();
    expect(screen.queryByText('Log in / Sign up')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('public-user-menu-toggle'));
    expect(await screen.findByTestId('public-user-wallet-balance')).toHaveTextContent('2,450,000');
    expect(screen.getByText('View Profile')).toHaveAttribute('href', '/account');
  });

  it('shows the mobile notification bell and empty state in fa/en/ar', async () => {
    for (const locale of ['fa', 'en', 'ar'] as const) {
      vi.restoreAllMocks();
      mockLocale(locale);
      mockCustomerNotifications();
      vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(true);
      vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
        status: 'authenticated',
        user: mockAuthUser({ id: 'u1', fullName: 'نگار رضایی', role: 'USER' }),
        requestLogin: vi.fn(),
        confirmTwoFactor: vi.fn(),
        agencyLogin: vi.fn(),
        signOut: vi.fn(),
      });
      vi.spyOn(publicSiteApi, 'fetchClubPoints').mockResolvedValue({ isMember: true, level: 'GOLD', balance: 12450 });
      vi.spyOn(publicSiteApi, 'fetchWallet').mockResolvedValue({ balanceIrr: '0' });
      vi.spyOn(publicSiteApi, 'fetchMyProfile').mockResolvedValue({
        fullName: 'نگار رضایی',
        nationalId: null,
        birthDate: null,
        passportNo: null,
        email: null,
        emailVerifiedAt: null,
        completionPct: 100,
        profileIncomplete: false,
        missingProfileFields: [],
      });

      const { unmount } = renderHeader();
      expect(screen.getByTestId('public-notif-toggle-mobile')).toBeInTheDocument();
      expect(screen.queryByTestId('public-notif-badge-mobile')).not.toBeInTheDocument();
      await userEvent.click(screen.getByTestId('public-notif-toggle-mobile'));
      expect(await screen.findByTestId('public-notif-dropdown-mobile')).toBeInTheDocument();
      expect(screen.getByTestId('public-notif-empty')).toBeInTheDocument();
      const emptyText =
        locale === 'en'
          ? 'No new notifications.'
          : locale === 'ar'
            ? 'لا توجد إشعارات جديدة.'
            : 'اعلان جدیدی ندارید.';
      expect(screen.getByTestId('public-notif-empty')).toHaveTextContent(emptyText);
      unmount();
    }
  });

  it('highlights Flights nav on the results route', () => {
    mockLocale();
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'unauthenticated',
      user: null,
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });

    renderHeader('/results?from=THR&to=MHD');
    const flightsLink = screen.getByRole('link', { name: 'پرواز' });
    expect(flightsLink).toHaveStyle({ color: '#1668c4' });
  });

  it('does not show travel info in the nav', () => {
    mockLocale();
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'unauthenticated',
      user: null,
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });

    renderHeader();
    expect(screen.queryByText('اطلاعات سفر')).not.toBeInTheDocument();
  });

  it('switches locale via the language dropdown', async () => {
    const setLocale = vi.fn();
    vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale: 'fa', setLocale });
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'unauthenticated',
      user: null,
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });

    renderHeader();
    await userEvent.click(screen.getByTestId('public-lang-toggle'));
    await userEvent.click(screen.getByTestId('public-lang-option-en'));
    expect(setLocale).toHaveBeenCalledWith('en');
  });

  it('shows account panel links in the mobile hamburger menu when logged in', async () => {
    mockLocale();
    mockCustomerNotifications();
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(true);
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockAuthUser({ id: 'u1', fullName: 'نگار رضایی', role: 'USER' }),
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });
    vi.spyOn(publicSiteApi, 'fetchClubPoints').mockResolvedValue({ isMember: true, level: 'GOLD', balance: 12450 });
    vi.spyOn(publicSiteApi, 'fetchWallet').mockResolvedValue({ balanceIrr: '0' });
    vi.spyOn(publicSiteApi, 'fetchMyProfile').mockResolvedValue({
      fullName: 'نگار رضایی',
      nationalId: null,
      birthDate: null,
      passportNo: null,
      email: null,
      emailVerifiedAt: null,
      completionPct: 100,
      profileIncomplete: false,
      missingProfileFields: [],
    });

    renderHeader();
    await userEvent.click(screen.getByTestId('public-mobile-menu-toggle'));

    expect(screen.getByTestId('public-mobile-account-profile')).toHaveAttribute('href', '/account?tab=profile');
    expect(screen.getByTestId('public-mobile-account-account-info')).toHaveAttribute('href', '/account?tab=account-info');
    expect(screen.getByTestId('public-mobile-account-trips')).toHaveAttribute('href', '/account?tab=trips');
    expect(screen.getByText('مدیریت پروفایل')).toBeInTheDocument();
    expect(screen.getByText('اطلاعات حساب')).toBeInTheDocument();
    expect(screen.getAllByText('سفرها و خریدها').length).toBeGreaterThan(0);
    expect(screen.getByTestId('public-mobile-account-security')).toHaveAttribute('href', '/account?tab=security');
    expect(screen.queryByTestId('public-mobile-account-saved')).not.toBeInTheDocument();
  });

  it('keeps the mobile services menu collapsed until toggled', async () => {
    mockLocale();
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(true);
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'unauthenticated',
      user: null,
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });

    renderHeader();
    await userEvent.click(screen.getByTestId('public-mobile-menu-toggle'));

    expect(screen.getByTestId('public-mobile-services-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('public-mobile-services-panel')).not.toBeInTheDocument();
    expect(screen.queryByText('انتخاب صندلی')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('public-mobile-services-toggle'));
    expect(screen.getByTestId('public-mobile-services-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('public-mobile-services-panel')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /انتخاب صندلی/ })).toHaveAttribute('href', '/services/seat-selection');
    expect(screen.getByRole('link', { name: /اضافه بار/ })).toHaveAttribute('href', '/services/extra-baggage');
  });

  it('portals the login drawer above the home announcement stacking context', async () => {
    mockLocale();
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(true);
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      status: 'unauthenticated',
      user: null,
      requestLogin: vi.fn(),
      confirmTwoFactor: vi.fn(),
      agencyLogin: vi.fn(),
      signOut: vi.fn(),
    });

    renderHeader();
    await userEvent.click(screen.getByTestId('public-mobile-menu-toggle'));
    await userEvent.click(screen.getByTestId('public-login-drawer-open'));

    const drawer = screen.getByTestId('public-login-drawer');
    expect(drawer).toHaveStyle({ zIndex: '230' });
    expect(drawer.parentElement).toBe(document.body);
    expect(screen.getByText(/به باشگاه مشتریان blujet خوش آمدید/)).toBeInTheDocument();
  });
});
