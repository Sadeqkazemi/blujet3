import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchNotifications,
  fetchNotificationsUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../api/notifications';
import { fetchClubPoints, fetchMyProfile, fetchWallet } from '../../api/publicSite';
import {
  fetchCredit as fetchAgencyCredit,
  fetchProfile as fetchAgencyProfile,
} from '../../api/agency-portal';
import { localeMoney } from '../../lib/fa-format';
import { localeDigits } from '../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useT } from '../../lib/i18n';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { NotificationRow } from '../../types/notifications';
import {
  accountTabHref,
  mobileAccountNavItems,
  mobileAccountNavLabel,
} from '../../features/public-site/account/account-nav-items';
import ConfirmActionDialog from '../ConfirmActionDialog';
import {
  customerNotificationTarget,
  formatNotificationTime,
  notificationCategoryIcon,
} from './customer-notification-ui';
import { ServiceMenuIcon, type ServiceMenuIconKind } from './service-menu-icon';

const TIER_KEY: Record<string, 'tierSilver' | 'tierGold' | 'tierPlatinum'> = {
  SILVER: 'tierSilver',
  GOLD: 'tierGold',
  PLATINUM: 'tierPlatinum',
};

const LANG_OPTIONS: { value: StoredLocale; label: string }[] = [
  { value: 'fa', label: 'فارسی' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
];

const LOGOUT_COPY: Record<StoredLocale, { title: string; message: string; confirm: string; cancel: string; busy: string }> = {
  fa: { title: 'خروج از حساب', message: 'آیا مطمئن هستید که می‌خواهید از حساب کاربری خود خارج شوید؟', confirm: 'بله، خارج شو', cancel: 'انصراف', busy: 'در حال خروج…' },
  en: { title: 'Sign out', message: 'Are you sure you want to sign out of your account?', confirm: 'Yes, sign out', cancel: 'Cancel', busy: 'Signing out…' },
  ar: { title: 'تسجيل الخروج', message: 'هل أنت متأكد من رغبتك في تسجيل الخروج من حسابك؟', confirm: 'نعم، تسجيل الخروج', cancel: 'إلغاء', busy: 'جارٍ تسجيل الخروج…' },
};

const AGENCY_MENU_COPY: Record<StoredLocale, {
  usableCredit: string;
  portal: string;
  purchasedFlights: string;
  webservice: string;
  profile: string;
  logout: string;
}> = {
  fa: {
    usableCredit: 'اعتبار قابل استفاده',
    portal: 'پنل آژانس',
    purchasedFlights: 'پروازهای خریداری‌شده',
    webservice: 'وب‌سرویس',
    profile: 'مدارک و پروفایل',
    logout: 'خروج از حساب',
  },
  en: {
    usableCredit: 'Available credit',
    portal: 'Agency portal',
    purchasedFlights: 'Purchased flights',
    webservice: 'Web service',
    profile: 'Profile & documents',
    logout: 'Sign out',
  },
  ar: {
    usableCredit: 'الرصيد المتاح',
    portal: 'بوابة الوكالة',
    purchasedFlights: 'الرحلات المشتراة',
    webservice: 'خدمة الويب',
    profile: 'الملف والمستندات',
    logout: 'تسجيل الخروج',
  },
};

function GlobeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 4 5.7 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.7-4-9s1.5-6.5 4-9z" />
    </svg>
  );
}

function UserOutlineIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

function UserFilledIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5.33 0-9 2.69-9 6v2h18v-2c0-3.31-3.67-6-9-6z" />
    </svg>
  );
}

function ChevronIcon({ isRTL }: { isRTL: boolean }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9aa4b2"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none', transform: isRTL ? 'scaleX(-1)' : undefined }}
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9aa4b2" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CopyIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function MenuIconTrips() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

function MenuIconRefund() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-6.7L3 9" />
    </svg>
  );
}

function MenuIconClub() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 16.8l-5.4 2.8 1-6L3.3 9.4l6-.9z" />
    </svg>
  );
}

function MenuIconLogout() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/[^\d+]/g, '');
  return /^\+?\d{10,15}$/.test(digits);
}

function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length === 11 && digits.startsWith('09')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 12 && digits.startsWith('98')) {
    return `0${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  if (digits.length === 13 && digits.startsWith('989')) {
    return `0${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return value;
}

function isFlightsRoute(pathname: string) {
  return (
    pathname === '/' ||
    pathname.startsWith('/results') ||
    pathname.startsWith('/book') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/payment')
  );
}

function isServicesRoute(pathname: string) {
  return pathname.startsWith('/services/');
}

/** Sticky public-site header — matches design-reference-v2 shared shell. */
export default function PublicHeader() {
  const { status, user, signOut } = useAuth();
  const { locale, setLocale } = useLocale();
  const t = useT();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const isRTL = locale !== 'en';
  const [menuOpen, setMenuOpen] = useState(false);
  const [agencyMenuOpen, setAgencyMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [servicesMenuOpen, setServicesMenuOpen] = useState(false);
  const [mobileServicesOpen, setMobileServicesOpen] = useState(false);
  const [loginDrawerOpen, setLoginDrawerOpen] = useState(false);
  const [club, setClub] = useState<{ isMember: boolean; level: string | null; balance: number } | null>(null);
  const [walletBalanceIrr, setWalletBalanceIrr] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [agencyProfileName, setAgencyProfileName] = useState<string | null>(null);
  const [agencyLicenseNo, setAgencyLicenseNo] = useState<string | null>(null);
  const [agencyRemainingIrr, setAgencyRemainingIrr] = useState<string | null>(null);
  const [walletCopied, setWalletCopied] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifBusyId, setNotifBusyId] = useState<string | null>(null);
  const [markAllBusy, setMarkAllBusy] = useState(false);

  const loggedIn = status === 'authenticated' && user?.role === 'USER';
  const agencyLoggedIn = status === 'authenticated' && user?.role === 'AGENCY';
  const notifCountLabel = localeDigits(unreadCount, locale);
  const logoutCopy = LOGOUT_COPY[locale];

  function requestSignOut() {
    setMenuOpen(false);
    setAgencyMenuOpen(false);
    setMobileMenuOpen(false);
    setNotifOpen(false);
    setLogoutConfirmOpen(true);
  }

  async function confirmSignOut() {
    // Close immediately: server-side token revocation is best-effort and must
    // never leave the customer trapped behind a stale confirmation overlay.
    setLogoutConfirmOpen(false);
    setLogoutBusy(true);
    try {
      await signOut();
    } catch {
      // useAuth still clears the local session even if the revoke call fails.
    } finally {
      setLogoutBusy(false);
      navigate('/', { replace: true });
    }
  }

  useEffect(() => {
    if (!loggedIn) {
      setClub(null);
      setWalletBalanceIrr(null);
      setProfileName(null);
      setProfileIncomplete(false);
      setNotifications([]);
      setUnreadCount(0);
      setNotifOpen(false);
      return;
    }
    fetchClubPoints()
      .then(setClub)
      .catch(() => setClub(null));
    fetchWallet()
      .then((w) => setWalletBalanceIrr(w.balanceIrr))
      .catch(() => setWalletBalanceIrr('0'));
    fetchMyProfile()
      .then((p) => {
        setProfileName(p.fullName || null);
        setProfileIncomplete(p.completionPct < 100);
      })
      .catch(() => {
        setProfileName(null);
        setProfileIncomplete(false);
      });
    void Promise.all([
      fetchNotificationsUnreadCount().catch(() => null),
      fetchNotifications({ unreadOnly: true, limit: 20 }).catch(() => [] as NotificationRow[]),
    ]).then(([counts, rows]) => {
      setUnreadCount(counts?.total ?? 0);
      setNotifications(rows);
    });
  }, [loggedIn]);

  useEffect(() => {
    const onWalletBalance = (event: Event) => {
      const detail = (event as CustomEvent<{ balanceIrr?: string }>).detail;
      if (typeof detail?.balanceIrr === 'string') {
        setWalletBalanceIrr(detail.balanceIrr);
      }
    };
    window.addEventListener('blujet:wallet-balance', onWalletBalance);
    return () =>
      window.removeEventListener('blujet:wallet-balance', onWalletBalance);
  }, []);

  useEffect(() => {
    if (!agencyLoggedIn) {
      setAgencyProfileName(null);
      setAgencyLicenseNo(null);
      setAgencyRemainingIrr(null);
      setAgencyMenuOpen(false);
      return;
    }
    void Promise.all([
      fetchAgencyProfile().catch(() => null),
      fetchAgencyCredit().catch(() => null),
    ]).then(([profile, credit]) => {
      setAgencyProfileName(profile?.fullName?.trim() || user?.fullName?.trim() || null);
      setAgencyLicenseNo(profile?.licenseNo ?? null);
      setAgencyRemainingIrr(credit?.remainingIrr ?? null);
    });
  }, [agencyLoggedIn, user?.fullName]);

  async function openNotification(n: NotificationRow) {
    if (notifBusyId) return;
    setNotifBusyId(n.id);
    setNotifOpen(false);
    try {
      await markNotificationRead(n.id);
      setNotifications((current) => current.filter((row) => row.id !== n.id));
      setUnreadCount((c) => Math.max(0, c - 1));
      navigate(customerNotificationTarget(n));
    } catch {
      navigate(customerNotificationTarget(n));
    } finally {
      setNotifBusyId(null);
    }
  }

  async function markAllRead() {
    if (markAllBusy || unreadCount === 0) return;
    setMarkAllBusy(true);
    try {
      await markAllNotificationsRead();
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setMarkAllBusy(false);
    }
  }

  function toggleNotifOpen() {
    setMenuOpen(false);
    setLangOpen(false);
    setNotifOpen((v) => !v);
  }

  function notifDropdown(mobile: boolean): ReactNode {
    return (
      <>
        <div onClick={() => setNotifOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 120 }} />
        <div
          data-testid={mobile ? 'public-notif-dropdown-mobile' : 'public-notif-dropdown'}
          style={{
            position: 'absolute',
            top: mobile ? 46 : 52,
            [isRTL ? 'left' : 'right']: 0,
            width: mobile ? Math.min(320, typeof window !== 'undefined' ? window.innerWidth - 24 : 320) : 340,
            maxWidth: '92vw',
            background: '#fff',
            border: '1px solid #e6eaf0',
            borderRadius: 14,
            boxShadow: '0 20px 50px -16px rgba(13,38,64,.35)',
            zIndex: 130,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '11px 12px',
              borderBottom: '1px solid #eef1f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0d2640' }}>{t('notificationsTitle')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {unreadCount > 0 && (
                <span
                  data-testid="public-notif-new-badge"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#1668c4',
                    background: '#eef4fb',
                    padding: '2px 7px',
                    borderRadius: 12,
                  }}
                >
                  {notifCountLabel} {t('notifNewLabel')}
                </span>
              )}
              {unreadCount > 0 && (
                <button
                  type="button"
                  data-testid="public-notif-mark-all"
                  disabled={markAllBusy}
                  onClick={() => void markAllRead()}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#5a6678',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: markAllBusy ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                    padding: 0,
                  }}
                >
                  {t('notificationsMarkAll')}
                </button>
              )}
            </div>
          </div>
          <div style={{ maxHeight: mobile ? '55vh' : 360, overflow: 'auto' }}>
            {notifications.length === 0 ? (
              <p
                data-testid="public-notif-empty"
                style={{ margin: 0, padding: '28px 16px', textAlign: 'center', fontSize: 12.5, color: '#8a96a6' }}
              >
                {t('notificationsEmpty')}
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  data-testid={`public-notif-item-${n.id}`}
                  disabled={notifBusyId === n.id}
                  onClick={() => void openNotification(n)}
                  style={{
                    display: 'flex',
                    gap: 9,
                    width: '100%',
                    padding: '11px 12px',
                    border: 'none',
                    borderBottom: '1px solid #f4f6fa',
                    background: n.readAt ? '#fff' : '#f6faff',
                    textAlign: 'start',
                    cursor: notifBusyId === n.id ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                    opacity: notifBusyId === n.id ? 0.65 : 1,
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: '#f3f5f8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '15.5px',
                      flex: 'none',
                    }}
                  >
                    {notificationCategoryIcon(n.category)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#16202e' }}>{n.title}</div>
                    {n.body && (
                      <div style={{ fontSize: 13, color: '#6b7787', marginTop: 2, lineHeight: 1.7 }}>{n.body}</div>
                    )}
                    <div style={{ fontSize: '12.5px', color: '#6b7787', marginTop: 4 }}>
                      {formatNotificationTime(n.createdAt, locale)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </>
    );
  }

  const rawName = profileName?.trim() || user?.fullName?.trim() || '';
  const phoneAsName = rawName ? looksLikePhone(rawName) : false;
  const displayName = phoneAsName || !rawName ? t('defaultUserLabel') : rawName;
  const phoneDisplay = phoneAsName ? formatPhoneDisplay(rawName) : null;
  const walletAmountDisplay =
    walletBalanceIrr !== null ? localeMoney(walletBalanceIrr, locale) : '—';
  const tierLabel =
    club?.isMember && club.level && TIER_KEY[club.level]
      ? club.level === 'SILVER'
        ? locale === 'fa'
          ? 'عضو باشگاه'
          : locale === 'ar'
            ? 'عضو النادي'
            : 'Club member'
        : t(TIER_KEY[club.level])
      : null;
  const agencyCopy = AGENCY_MENU_COPY[locale];
  const agencyName = agencyProfileName ?? user?.fullName ?? '';
  const agencyInitials = agencyName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || 'AG';

  function agencyMenuPanel(mobile = false): ReactNode {
    const links = [
      { to: '/agency', label: agencyCopy.portal, icon: '♟' },
      { to: '/agency/sales', label: agencyCopy.purchasedFlights, icon: '♜' },
      { to: '/agency/webservice', label: agencyCopy.webservice, icon: '</>' },
      { to: '/agency/profile', label: agencyCopy.profile, icon: '▣' },
    ];
    return (
      <div data-testid={mobile ? 'public-agency-menu-mobile' : 'public-agency-menu'}>
        <div style={{ padding: '17px 18px 13px', borderBottom: '1px solid #eef1f5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 48, height: 48, borderRadius: 12, display: 'grid', placeItems: 'center', background: '#4d7fd1', color: '#fff', fontSize: 12, fontWeight: 900 }}>
              {agencyInitials}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#16202e', fontSize: 14, fontWeight: 900 }}>{agencyName}</div>
              <div dir="ltr" style={{ marginTop: 2, color: '#98a3b1', fontSize: 11, textAlign: isRTL ? 'right' : 'left' }}>
                {agencyLicenseNo || '—'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: 12, background: '#f5f8fc', padding: '10px 12px' }}>
            <span style={{ color: '#8090a3', fontSize: 10.5 }}>{agencyCopy.usableCredit}</span>
            <strong style={{ color: '#0d2640', fontSize: 12.5 }}>
              {agencyRemainingIrr === null ? '—' : localeMoney(agencyRemainingIrr, locale)}
            </strong>
          </div>
        </div>
        <div style={{ padding: '7px 0' }}>
          {links.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setAgencyMenuOpen(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 17px', color: '#1f2937', textDecoration: 'none', fontSize: 12.5, fontWeight: 750 }}
            >
              <span aria-hidden style={{ width: 20, textAlign: 'center', color: '#315fbd', fontSize: 13 }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
        <button
          type="button"
          data-testid="public-agency-logout"
          onClick={requestSignOut}
          style={{ width: '100%', border: 0, borderTop: '1px solid #eef1f5', background: '#fff', padding: '12px 17px', color: '#e5484d', textAlign: 'start', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
        >
          ↩ {agencyCopy.logout}
        </button>
      </div>
    );
  }

  async function copyWalletBalance() {
    if (walletBalanceIrr === null) return;
    try {
      await navigator.clipboard.writeText(walletAmountDisplay);
      setWalletCopied(true);
      window.setTimeout(() => setWalletCopied(false), 1600);
    } catch {
      /* clipboard may be blocked in some browsers/tests */
    }
  }

  const navLinks = [
    { to: '/', label: t('navFlights'), active: isFlightsRoute(location.pathname) },
    { to: '/destinations', label: t('navDestinations'), active: location.pathname.startsWith('/destinations') },
    { to: '/club', label: t('navLoyalty'), active: location.pathname.startsWith('/club') },
    { to: '/support', label: t('navSupport'), active: location.pathname.startsWith('/support') },
  ];

  const serviceLinks: { to: string; label: string; icon: ServiceMenuIconKind }[] = [
    { to: '/services/seat-selection', label: t('svcSeatLabel'), icon: 'seat' },
    { to: '/services/extra-baggage', label: t('svcBaggageLabel'), icon: 'baggage' },
    { to: '/services/refund-info', label: t('svcRefundLabel'), icon: 'refund' },
    { to: '/services/pet-travel', label: t('svcPetLabel'), icon: 'pet' },
    { to: '/services/wheelchair', label: t('svcWheelchairLabel'), icon: 'wheelchair' },
  ];
  const servicesActive = isServicesRoute(location.pathname);

  const logoTextColor = isMobile ? '#fff' : '#16202e';
  const logoSquareBg = isMobile ? '#fff' : '#1668c4';
  const logoIconColor = isMobile ? '#1668c4' : '#fff';

  const langDropdown = (
    <>
      <div onClick={() => setLangOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 120 }} />
      <div
        style={{
          position: 'absolute',
          top: 44,
          [isRTL ? 'left' : 'right']: 0,
          width: 150,
          background: '#fff',
          border: '1px solid #e6eaf0',
          borderRadius: 14,
          boxShadow: '0 20px 50px -16px rgba(13,38,64,.35)',
          zIndex: 130,
          overflow: 'hidden',
          padding: 6,
        }}
      >
        {LANG_OPTIONS.map((opt) => (
          <div
            key={opt.value}
            data-testid={`public-lang-option-${opt.value}`}
            onClick={() => {
              setLocale(opt.value);
              setLangOpen(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '9px 11px',
              borderRadius: 9,
              fontSize: '12.5px',
              fontWeight: 600,
              color: '#16202e',
              cursor: 'pointer',
            }}
          >
            {opt.label}
            {locale === opt.value && <span style={{ color: '#1668c4', fontWeight: 900 }}>✓</span>}
          </div>
        ))}
      </div>
    </>
  );

  const menuLinkStyle = (compact: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: '10px 11px',
    borderRadius: 9,
    fontSize: compact ? 12 : '12.5px',
    color: '#16202e',
    textDecoration: 'none',
    fontWeight: 600,
  });

  const userMenuPanel = (compact: boolean) => (
    <>
      <div style={{ padding: compact ? 15 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: 'linear-gradient(135deg,#1668c4,#0d3b66)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <UserFilledIcon size={compact ? 19 : 20} />
          </div>
          <div style={{ lineHeight: 1.5, minWidth: 0 }}>
            <div style={{ fontSize: compact ? 13 : 14, fontWeight: 800, color: '#16202e' }}>{displayName}</div>
            {phoneDisplay && (
              <div style={{ fontSize: compact ? 11 : 12, color: '#9aa4b2', fontWeight: 600 }} dir="ltr">
                {phoneDisplay}
              </div>
            )}
            {club?.isMember && tierLabel && (
              <div style={{ marginTop: 2, fontSize: compact ? 10 : 11, color: '#caa53a', fontWeight: 700 }}>
                ★ {tierLabel} · {localeMoney(club.balance, locale)} {locale === 'fa' ? 'امتیاز' : locale === 'ar' ? 'نقطة' : 'points'}
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginTop: compact ? 13 : 14,
            background: '#f6f8fb',
            border: '1px solid #eef1f5',
            borderRadius: 12,
            padding: compact ? '10px 12px' : '11px 13px',
          }}
        >
          <div>
            <div style={{ fontSize: compact ? '10.5px' : 11, color: '#8a96a6', marginBottom: compact ? 3 : 4 }}>
              {t('walletBalanceLabel')}
            </div>
            <div
              data-testid="public-user-wallet-balance"
              style={{ fontSize: compact ? 15 : 16, fontWeight: 800, color: '#16202e' }}
            >
              {walletAmountDisplay}
            </div>
            {walletCopied && (
              <div style={{ marginTop: 3, fontSize: 10, color: '#1f8a5b', fontWeight: 700 }}>
                {t('walletCopiedLabel')}
              </div>
            )}
          </div>
          <button
            type="button"
            data-testid="public-user-wallet-copy"
            onClick={() => void copyWalletBalance()}
            style={{
              width: compact ? 30 : 32,
              height: compact ? 30 : 32,
              borderRadius: compact ? 8 : 9,
              background: '#fff',
              border: '1px solid #e2e7ee',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#5a6678',
              cursor: 'pointer',
              flex: 'none',
              padding: 0,
            }}
            aria-label={t('walletBalanceLabel')}
          >
            <CopyIcon size={compact ? 14 : 15} />
          </button>
        </div>
      </div>
      <div style={{ height: 1, background: '#eef1f5' }} />
      <div style={{ padding: 5 }}>
        {profileIncomplete && (
          <Link
            to="/account?tab=account-info"
            data-testid="public-complete-profile"
            onClick={() => {
              setMenuOpen(false);
              setMobileMenuOpen(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              margin: '4px 6px 8px',
              padding: '9px 11px',
              background: '#fff7ed',
              border: '1px solid #f6dcbb',
              borderRadius: 9,
              textDecoration: 'none',
              color: '#9a5b16',
              fontSize: '11.5px',
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#e5484d',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                flex: 'none',
              }}
            >
              !
            </span>
            {t('completeProfileLabel')}
          </Link>
        )}
        <Link to="/account" onClick={() => setMenuOpen(false)} style={menuLinkStyle(compact)}>
          <span style={{ color: '#5a6678', display: 'flex' }}>
            <UserOutlineIcon size={17} />
          </span>
          {t('profileLabel')}
        </Link>
        <Link to="/account?tab=trips" onClick={() => setMenuOpen(false)} style={menuLinkStyle(compact)}>
          <span style={{ color: '#5a6678', display: 'flex' }}>
            <MenuIconTrips />
          </span>
          {t('tripsLabel')}
        </Link>
        <Link to="/account?tab=refunds" onClick={() => setMenuOpen(false)} style={menuLinkStyle(compact)}>
          <span style={{ color: '#5a6678', display: 'flex' }}>
            <MenuIconRefund />
          </span>
          {t('refundLabel')}
        </Link>
        <Link to="/club" onClick={() => setMenuOpen(false)} style={menuLinkStyle(compact)}>
          <span style={{ color: '#5a6678', display: 'flex' }}>
            <MenuIconClub />
          </span>
          {t('navLoyalty')}
        </Link>
        <div style={{ height: 1, background: '#eef1f5', margin: '5px 3px' }} />
        <button
          type="button"
          data-testid="public-logout"
          onClick={requestSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '10px 11px',
            borderRadius: 9,
            fontSize: compact ? 12 : '12.5px',
            color: '#e5484d',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            width: '100%',
            textAlign: 'start',
          }}
        >
          <span style={{ display: 'inline-flex' }}>
            <MenuIconLogout />
          </span>
          {t('logoutLabel')}
        </button>
      </div>
    </>
  );

  const profileWarnDot = (borderColor: string) =>
    profileIncomplete ? (
      <span
        data-testid="public-profile-incomplete-dot"
        style={{
          position: 'absolute',
          top: -2,
          [isRTL ? 'left' : 'right']: -2,
          width: 11,
          height: 11,
          borderRadius: '50%',
          background: '#e5484d',
          border: `1.5px solid ${borderColor}`,
        }}
      />
    ) : null;

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        // Home announcement bar uses z-index 60. Full-screen overlays rendered
        // inside this header must raise the header stacking context above it,
        // otherwise the banner paints on top of the login drawer / mobile menu.
        zIndex: loginDrawerOpen || mobileMenuOpen ? 220 : 50,
      }}
    >
      <div
        style={{
          background: isMobile ? '#1668c4' : '#fff',
          borderBottom: isMobile ? 'none' : '1px solid #e6eaf0',
          boxShadow: '0 2px 12px -8px rgba(13,38,102,.25)',
        }}
      >
        <div
          style={{
            maxWidth: 1320,
            margin: '0 auto',
            padding: '0 26px',
            height: isMobile ? 62 : 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {isMobile && (
            <span
              data-testid="public-mobile-menu-toggle"
              onClick={() => {
                setMobileMenuOpen((v) => {
                  const next = !v;
                  if (next && isServicesRoute(location.pathname)) {
                    setMobileServicesOpen(true);
                  }
                  if (!next) setMobileServicesOpen(false);
                  return next;
                });
              }}
              style={{
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                cursor: 'pointer',
                fontSize: 18,
                color: '#fff',
                flex: 'none',
              }}
            >
              ☰
            </span>
          )}

          <Link
            to="/"
            style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: logoTextColor }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: logoSquareBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: logoIconColor,
                fontSize: 19,
              }}
            >
              ✈
            </div>
            <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: '-.5px', color: logoTextColor }}>blujet</span>
          </Link>

          {!isMobile && (
            <nav style={{ display: 'flex', gap: 30, fontSize: '16.5px', color: '#3b4554', fontWeight: 600, height: '100%', alignItems: 'center' }}>
              {navLinks.slice(0, 2).map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  style={
                    link.active
                      ? { color: '#1668c4', height: '100%', display: 'flex', alignItems: 'center', borderBottom: '3px solid #1668c4', textDecoration: 'none' }
                      : { textDecoration: 'none', color: '#3b4554' }
                  }
                >
                  {link.label}
                </Link>
              ))}
              <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
                <span
                  data-testid="public-services-menu-toggle"
                  onClick={() => setServicesMenuOpen((v) => !v)}
                  style={{
                    cursor: 'pointer',
                    color: servicesActive ? '#1668c4' : '#3b4554',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    height: '100%',
                    borderBottom: servicesActive ? '3px solid #1668c4' : '3px solid transparent',
                  }}
                >
                  {t('navServices')}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: servicesMenuOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
                {servicesMenuOpen && (
                  <>
                    <div onClick={() => setServicesMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 59 }} />
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        [isRTL ? 'right' : 'left']: 0,
                        marginTop: 10,
                        width: 230,
                        background: '#fff',
                        border: '1px solid #eef1f5',
                        borderRadius: 14,
                        boxShadow: '0 18px 40px -14px rgba(13,38,102,.25)',
                        padding: 10,
                        zIndex: 60,
                      }}
                    >
                      {serviceLinks.map((item) => {
                        const active = location.pathname === item.to;
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setServicesMenuOpen(false)}
                            style={{
                              textDecoration: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              padding: '9px 10px',
                              borderRadius: 10,
                              fontSize: 12.5,
                              fontWeight: active ? 700 : 600,
                              color: active ? '#1668c4' : '#16202e',
                            }}
                          >
                            <span>{item.label}</span>
                            <span
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                background: '#f2f4f7',
                                color: '#3b4554',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flex: 'none',
                              }}
                            >
                              <ServiceMenuIcon kind={item.icon} />
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              {navLinks.slice(2).map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  style={
                    link.active
                      ? { color: '#1668c4', height: '100%', display: 'flex', alignItems: 'center', borderBottom: '3px solid #1668c4', textDecoration: 'none' }
                      : { textDecoration: 'none', color: '#3b4554' }
                  }
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}

          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative' }}>
                <span
                  data-testid="public-lang-toggle"
                  onClick={() => setLangOpen((v) => !v)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    color: '#5a6678',
                    border: '1.5px solid #e2e7ee',
                    borderRadius: 20,
                    padding: '6px 12px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                  }}
                >
                  <GlobeIcon />
                  {locale.toUpperCase()}
                </span>
                {langOpen && langDropdown}
              </div>
              {!loggedIn && !agencyLoggedIn && (
                <>
                  <Link
                    to="/signin"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '7px 15px',
                      border: '1.5px solid #d5e1f0',
                      color: '#0d2640',
                      borderRadius: 10,
                      fontSize: '12.5px',
                      fontWeight: 700,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <UserOutlineIcon />
                    {t('btnLoginSignup')}
                  </Link>
                  <Link
                    to="/club"
                    style={{
                      padding: '8px 18px',
                      background: '#1668c4',
                      color: '#fff',
                      borderRadius: 10,
                      fontSize: '12.5px',
                      fontWeight: 700,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t('btnJoinClub')}
                  </Link>
                </>
              )}

              {agencyLoggedIn && user && (
                <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  data-testid="public-agency-identity"
                  aria-expanded={agencyMenuOpen}
                  onClick={() => {
                    setAgencyMenuOpen((open) => !open);
                    setMenuOpen(false);
                    setNotifOpen(false);
                    setLangOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '5px 9px 5px 13px',
                    border: '1px solid #dbe5f1',
                    borderRadius: 26,
                    color: '#0d2640',
                    textDecoration: 'none',
                    fontSize: 12.5,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    background: '#fff',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <span>{agencyName}</span>
                  <span
                    style={{
                      display: 'grid',
                      width: 36,
                      height: 36,
                      placeItems: 'center',
                      borderRadius: 10,
                      background: '#1668c4',
                      color: '#fff',
                      fontSize: 11,
                    }}
                  >
                    {agencyInitials}
                  </span>
                </button>
                {agencyMenuOpen && (
                  <>
                    <span
                      aria-hidden
                      onClick={() => setAgencyMenuOpen(false)}
                      style={{ position: 'fixed', inset: 0, zIndex: 118 }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 52,
                        [isRTL ? 'left' : 'right']: 0,
                        zIndex: 119,
                        width: 320,
                        overflow: 'hidden',
                        border: '1px solid #e1e8f0',
                        borderRadius: 18,
                        background: '#fff',
                        boxShadow: '0 18px 48px rgba(13,38,64,.18)',
                      }}
                    >
                      {agencyMenuPanel()}
                    </div>
                  </>
                )}
                </div>
              )}

              {loggedIn && user && (
                <>
                  <div style={{ position: 'relative' }}>
                    <div
                      data-testid="public-notif-toggle"
                      onClick={toggleNotifOpen}
                      aria-label={t('notificationsTitle')}
                      aria-expanded={notifOpen}
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: '50%',
                        background: '#f3f5f8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#5a6678',
                        fontSize: '16.5px',
                        position: 'relative',
                        cursor: 'pointer',
                      }}
                    >
                      🔔
                      {unreadCount > 0 && (
                        <span
                          data-testid="public-notif-badge"
                          style={{
                            position: 'absolute',
                            top: 5,
                            [isRTL ? 'left' : 'right']: 8,
                            minWidth: 16,
                            height: 16,
                            padding: '0 3px',
                            boxSizing: 'border-box',
                            borderRadius: 8,
                            background: '#e5484d',
                            border: '1.5px solid #fff',
                            color: '#fff',
                            fontSize: 9,
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            lineHeight: 1,
                          }}
                        >
                          {notifCountLabel}
                        </span>
                      )}
                    </div>
                    {notifOpen && notifDropdown(false)}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <div
                      data-testid="public-user-menu-toggle"
                      onClick={() => {
                        setNotifOpen(false);
                        setMenuOpen((v) => !v);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: '#fff',
                        border: '1px solid #e6eaf0',
                        padding: '4px 10px 4px 7px',
                        borderRadius: 28,
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg,#1668c4,#0d3b66)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '13.5px',
                          position: 'relative',
                        }}
                      >
                        <UserFilledIcon />
                        {profileWarnDot('#fff')}
                      </div>
                      <div style={{ lineHeight: 1.35, textAlign: isRTL ? 'right' : 'left' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#16202e' }}>{displayName}</div>
                      </div>
                      <ChevronDownIcon />
                    </div>

                    {menuOpen && (
                      <>
                        <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 120 }} />
                        <div
                          data-testid="public-user-menu"
                          style={{
                            position: 'absolute',
                            top: 54,
                            [isRTL ? 'left' : 'right']: 0,
                            width: 320,
                            background: '#fff',
                            border: '1px solid #e6eaf0',
                            borderRadius: 16,
                            boxShadow: '0 20px 50px -16px rgba(13,38,64,.35)',
                            zIndex: 130,
                            overflow: 'hidden',
                          }}
                        >
                          {userMenuPanel(false)}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <div style={{ position: 'relative' }}>
                <span
                  data-testid="public-lang-toggle-mobile"
                  onClick={() => setLangOpen((v) => !v)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    height: 36,
                    padding: '0 9px',
                    borderRadius: 20,
                    background: 'rgba(255,255,255,.16)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '11.5px',
                    fontWeight: 800,
                  }}
                >
                  <GlobeIcon size={16} />
                  {locale.toUpperCase()}
                </span>
                {langOpen && langDropdown}
              </div>
              {loggedIn && user ? (
                <>
                  <div style={{ position: 'relative' }}>
                    <span
                      data-testid="public-notif-toggle-mobile"
                      onClick={toggleNotifOpen}
                      aria-label={t('notificationsTitle')}
                      aria-expanded={notifOpen}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        cursor: 'pointer',
                        position: 'relative',
                        fontSize: 17,
                      }}
                    >
                      🔔
                      {unreadCount > 0 && (
                        <span
                          data-testid="public-notif-badge-mobile"
                          style={{
                            position: 'absolute',
                            top: 2,
                            [isRTL ? 'left' : 'right']: 2,
                            minWidth: 15,
                            height: 15,
                            padding: '0 3px',
                            boxSizing: 'border-box',
                            borderRadius: 8,
                            background: '#e5484d',
                            border: '1.5px solid #1668c4',
                            color: '#fff',
                            fontSize: 8.5,
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            lineHeight: 1,
                          }}
                        >
                          {notifCountLabel}
                        </span>
                      )}
                    </span>
                    {notifOpen && notifDropdown(true)}
                  </div>
                  <div style={{ position: 'relative' }}>
                  <span
                    data-testid="public-user-menu-toggle-mobile"
                    onClick={() => {
                      setNotifOpen(false);
                      setMenuOpen((v) => !v);
                    }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                  >
                    <UserOutlineIcon size={19} />
                    {profileWarnDot('#0d2640')}
                  </span>
                  {menuOpen && (
                    <>
                      <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 120 }} />
                      <div
                        style={{
                          position: 'absolute',
                          top: 46,
                          [isRTL ? 'left' : 'right']: 0,
                          width: 280,
                          maxWidth: '80vw',
                          background: '#fff',
                          border: '1px solid #e6eaf0',
                          borderRadius: 16,
                          boxShadow: '0 20px 50px -16px rgba(13,38,64,.35)',
                          zIndex: 130,
                          overflow: 'hidden',
                        }}
                        data-testid="public-user-menu-mobile"
                      >
                        {userMenuPanel(true)}
                      </div>
                    </>
                  )}
                </div>
                </>
              ) : agencyLoggedIn && user ? (
                <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  data-testid="public-agency-identity-mobile"
                  aria-label={agencyName}
                  aria-expanded={agencyMenuOpen}
                  onClick={() => setAgencyMenuOpen((open) => !open)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    display: 'grid',
                    placeItems: 'center',
                    background: '#fff',
                    color: '#1668c4',
                    fontSize: 10,
                    fontWeight: 900,
                    border: 0,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {agencyInitials}
                </button>
                {agencyMenuOpen && (
                  <>
                    <span aria-hidden onClick={() => setAgencyMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 218 }} />
                    <div
                      style={{
                        position: 'fixed',
                        top: 68,
                        left: 12,
                        right: 12,
                        zIndex: 219,
                        overflow: 'hidden',
                        border: '1px solid #e1e8f0',
                        borderRadius: 18,
                        background: '#fff',
                        boxShadow: '0 18px 48px rgba(13,38,64,.22)',
                      }}
                    >
                      {agencyMenuPanel(true)}
                    </div>
                  </>
                )}
                </div>
              ) : (
                <span
                  data-testid="public-signin-mobile"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setLoginDrawerOpen(true);
                  }}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <UserOutlineIcon size={19} />
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {isMobile && mobileMenuOpen && (
        <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 210, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '26px 20px 18px' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#16202e' }}>{t('menuTitle')}</span>
            <span
              onClick={() => setMobileMenuOpen(false)}
              style={{
                position: 'absolute',
                [isRTL ? 'left' : 'right']: 20,
                top: 22,
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                color: '#16202e',
                cursor: 'pointer',
              }}
            >
              ×
            </span>
          </div>
          <div style={{ padding: '4px 24px 0', display: 'flex', flexDirection: 'column' }}>
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              style={{
                padding: '20px 0',
                textDecoration: 'none',
                color: '#16202e',
                fontSize: 17,
                fontWeight: 700,
              }}
            >
              {t('navFlights')}
            </Link>
            {loggedIn &&
              mobileAccountNavItems().map((item) => (
                <Link
                  key={item.key}
                  to={accountTabHref(item.key)}
                  data-testid={`public-mobile-account-${item.key}`}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    padding: '20px 0',
                    textDecoration: 'none',
                    color: '#16202e',
                    fontSize: 17,
                    fontWeight: 700,
                    borderTop: '1px solid #eef1f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <span style={{ whiteSpace: 'nowrap' }}>{mobileAccountNavLabel(item, locale)}</span>
                  <ChevronIcon isRTL={isRTL} />
                </Link>
              ))}
            {navLinks.slice(1, 2).map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  padding: '20px 0',
                  textDecoration: 'none',
                  color: '#16202e',
                  fontSize: 17,
                  fontWeight: 700,
                  borderTop: '1px solid #eef1f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                {link.label}
                <ChevronIcon isRTL={isRTL} />
              </Link>
            ))}
            <div style={{ borderTop: '1px solid #eef1f5' }}>
              <button
                type="button"
                data-testid="public-mobile-services-toggle"
                aria-expanded={mobileServicesOpen}
                onClick={() => setMobileServicesOpen((v) => !v)}
                style={{
                  width: '100%',
                  padding: '20px 0',
                  border: 'none',
                  background: 'transparent',
                  color: servicesActive ? '#1668c4' : '#16202e',
                  fontSize: 17,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span>{t('navServices')}</span>
                <span
                  style={{
                    display: 'flex',
                    color: '#9aa4b2',
                    transform: mobileServicesOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform .15s',
                  }}
                >
                  <ChevronDownIcon />
                </span>
              </button>
              {mobileServicesOpen && (
                <div data-testid="public-mobile-services-panel" style={{ paddingBottom: 8 }}>
                  {serviceLinks.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setMobileServicesOpen(false);
                      }}
                      style={{
                        padding: '12px 0 12px 4px',
                        textDecoration: 'none',
                        color: location.pathname === item.to ? '#1668c4' : '#16202e',
                        fontSize: 15,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            background: '#f2f4f7',
                            color: '#3b4554',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: 'none',
                          }}
                        >
                          <ServiceMenuIcon kind={item.icon} />
                        </span>
                        {item.label}
                      </span>
                      <ChevronIcon isRTL={isRTL} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
            {navLinks.slice(2).map((link, i, arr) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  padding: '20px 0',
                  textDecoration: 'none',
                  color: '#16202e',
                  fontSize: 17,
                  fontWeight: 700,
                  borderTop: '1px solid #eef1f5',
                  borderBottom: i === arr.length - 1 ? '1px solid #eef1f5' : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                {link.label}
                <ChevronIcon isRTL={isRTL} />
              </Link>
            ))}
          </div>
          <div style={{ marginTop: 'auto', padding: '14px 24px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!loggedIn && !agencyLoggedIn && (
              <span
                data-testid="public-login-drawer-open"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setLoginDrawerOpen(true);
                }}
                style={{ textAlign: 'center', padding: 13, border: '1.5px solid #d5e1f0', color: '#0d2640', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                {t('btnLoginOnly')}
              </span>
            )}
            {loggedIn && user && (
              <button
                type="button"
                data-testid="public-logout"
                onClick={requestSignOut}
                style={{ padding: '10px 0', color: '#e5484d', fontSize: 14, fontWeight: 700, cursor: 'pointer', border: 'none', background: 'transparent', width: '100%', textAlign: 'inherit' }}
              >
                ↩ {t('logoutLabel')}
              </button>
            )}
            {agencyLoggedIn && user && (
              <button
                type="button"
                data-testid="public-agency-logout-mobile"
                onClick={requestSignOut}
                style={{ padding: '10px 0', color: '#e5484d', fontSize: 14, fontWeight: 700, cursor: 'pointer', border: 'none', background: 'transparent', width: '100%', textAlign: 'inherit' }}
              >
                ↩ {agencyCopy.logout}
              </button>
            )}
          </div>
        </div>
      )}

      {loginDrawerOpen &&
        createPortal(
          <div
            data-testid="public-login-drawer"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'linear-gradient(165deg,#0d2640,#1668c4)',
              color: '#fff',
              zIndex: 230,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '26px 20px 18px' }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{t('loginDrawerTitle')}</span>
              <span
                data-testid="public-login-drawer-close"
                onClick={() => setLoginDrawerOpen(false)}
                style={{
                  position: 'absolute',
                  [isRTL ? 'left' : 'right']: 20,
                  top: 22,
                  width: 34,
                  height: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                ×
              </span>
            </div>
            <div style={{ padding: '34px 28px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 16, lineHeight: 1.7, color: '#dbe7f7', margin: '8px 0 34px' }}>{t('loginWelcome')}</p>
              <Link
                to="/signin"
                onClick={() => setLoginDrawerOpen(false)}
                style={{
                  display: 'block',
                  padding: 16,
                  background: '#fff',
                  color: '#0d2640',
                  borderRadius: 30,
                  fontSize: '15.5px',
                  fontWeight: 800,
                  textDecoration: 'none',
                  marginBottom: 14,
                }}
              >
                {t('btnLoginOnly')}
              </Link>
              <Link
                to="/club"
                onClick={() => setLoginDrawerOpen(false)}
                style={{
                  display: 'block',
                  padding: 16,
                  background: 'transparent',
                  color: '#fff',
                  border: '1.5px solid rgba(255,255,255,.6)',
                  borderRadius: 30,
                  fontSize: '15.5px',
                  fontWeight: 800,
                  textDecoration: 'none',
                  marginBottom: 22,
                }}
              >
                {t('btnJoinClub')}
              </Link>
              <Link
                to="/club"
                onClick={() => setLoginDrawerOpen(false)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  color: '#fff',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {t('discoverMoreLabel')} <span>{isRTL ? '←' : '→'}</span>
              </Link>
            </div>
          </div>,
          document.body,
        )}
      <ConfirmActionDialog
        open={logoutConfirmOpen}
        title={logoutCopy.title}
        message={logoutCopy.message}
        confirmLabel={logoutCopy.confirm}
        cancelLabel={logoutCopy.cancel}
        busy={logoutBusy}
        busyLabel={logoutCopy.busy}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={confirmSignOut}
        variant="light"
        testId="public-logout-confirm"
      />
    </header>
  );
}
