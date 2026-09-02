import { useState } from 'react';
import type { AuthUser } from '../../../types/auth';
import { localeDigits } from '../../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../../hooks/useLocale';
import type { TabKey } from './account-types';
import { sidebarAccountNavItems } from './account-nav-items';
import ConfirmActionDialog from '../../../components/ConfirmActionDialog';

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

const TIER_LABEL: Record<string, Record<StoredLocale, string>> = {
  SILVER: { fa: 'عضو باشگاه', en: 'Club Member', ar: 'عضو النادي' },
  GOLD: { fa: 'عضو طلایی باشگاه', en: 'Gold Club Member', ar: 'عضو ذهبية النادي' },
  PLATINUM: { fa: 'عضو پلاتین باشگاه', en: 'Platinum Club Member', ar: 'عضو بلاتينية النادي' },
};

const STR: Record<
  StoredLocale,
  {
    loyaltyPoints: string;
    walletLink: string;
    logout: string;
    logoutTitle: string;
    logoutMessage: string;
    logoutConfirm: string;
    logoutCancel: string;
    logoutBusy: string;
    defaultUserName: string;
    newMember: string;
  }
> = {
  fa: {
    loyaltyPoints: 'امتیاز باشگاه',
    walletLink: 'کیف پول',
    logout: 'خروج از حساب',
    logoutTitle: 'خروج از حساب',
    logoutMessage: 'آیا مطمئن هستید که می‌خواهید از حساب کاربری خود خارج شوید؟',
    logoutConfirm: 'بله، خارج شو',
    logoutCancel: 'انصراف',
    logoutBusy: 'در حال خروج…',
    defaultUserName: 'کاربر',
    newMember: 'عضو جدید باشگاه',
  },
  en: {
    loyaltyPoints: 'Loyalty Points',
    walletLink: 'Wallet',
    logout: 'Log Out',
    logoutTitle: 'Sign out',
    logoutMessage: 'Are you sure you want to sign out of your account?',
    logoutConfirm: 'Yes, sign out',
    logoutCancel: 'Cancel',
    logoutBusy: 'Signing out…',
    defaultUserName: 'User',
    newMember: 'New Club Member',
  },
  ar: {
    loyaltyPoints: 'نقاط الولاء',
    walletLink: 'المحفظة',
    logout: 'تسجيل الخروج',
    logoutTitle: 'تسجيل الخروج',
    logoutMessage: 'هل أنت متأكد من رغبتك في تسجيل الخروج من حسابك؟',
    logoutConfirm: 'نعم، تسجيل الخروج',
    logoutCancel: 'إلغاء',
    logoutBusy: 'جارٍ تسجيل الخروج…',
    defaultUserName: 'مستخدم',
    newMember: 'عضو جديد النادي',
  },
};

const NAV_ICONS: Record<TabKey, React.ReactNode> = {
  profile: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 19.5V21" />
      <circle cx="12" cy="7.5" r="4" />
    </svg>
  ),
  'account-info': (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  ),
  trips: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v2.2a1.6 1.6 0 0 0 0 2.6v2.2A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 15.5v-2.2a1.6 1.6 0 0 0 0-2.6Z" />
      <path d="M14 7v12" strokeDasharray="1.5 2.5" />
    </svg>
  ),
  refunds: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 6 6v1" />
    </svg>
  ),
  wallet: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11V7.5A1.5 1.5 0 0 0 19.5 6H5a2 2 0 0 1 0-4h13" />
      <path d="M3 4v14a2 2 0 0 0 2 2h14.5a1.5 1.5 0 0 0 1.5-1.5V15" />
      <path d="M21 11h-4a2 2 0 0 0 0 4h4Z" />
    </svg>
  ),
  loans: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  ),
  club: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8.5 7 12l5-7 5 7 4-3.5-1.8 9.5a1 1 0 0 1-1 .8H5.8a1 1 0 0 1-1-.8Z" />
      <circle cx="12" cy="3.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
  'price-locks': (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  passengers: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  ),
  tickets: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  identity: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M13 10h5M13 14h4M5.5 16a3 3 0 0 1 6 0" />
    </svg>
  ),
  security: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3z" />
    </svg>
  ),
  banks: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  ),
  referral: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

function NavButton({
  tabKey,
  label,
  active,
  onSelect,
  isRTL,
}: {
  tabKey: TabKey;
  label: string;
  active: boolean;
  onSelect: () => void;
  isRTL: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={`account-tab-${tabKey}`}
      onClick={onSelect}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        width: '100%',
        padding: '9px 12px',
        borderRadius: 11,
        cursor: 'pointer',
        fontSize: 13,
        whiteSpace: 'nowrap',
        fontWeight: active ? 700 : 600,
        color: active ? '#1668c4' : '#3b4554',
        background: active ? '#eef4fb' : 'transparent',
        marginBottom: 2,
        border: 'none',
        fontFamily: 'inherit',
        textAlign: 'inherit',
      }}
    >
      <span
        style={{
          position: 'absolute',
          ...(isRTL ? { right: -1 } : { left: -1 }),
          top: '50%',
          transform: 'translateY(-50%)',
          width: 3,
          height: active ? 18 : 0,
          borderRadius: 3,
          background: '#1668c4',
          transition: 'height .15s',
        }}
      />
      <span
        style={{
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: active ? '#1668c4' : '#8a96a6',
          flex: 'none',
        }}
      >
        {NAV_ICONS[tabKey]}
      </span>
      {label}
    </button>
  );
}

interface Props {
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  user: AuthUser | null;
  club: { isMember: boolean; level: string | null; balance: number } | null;
  onSignOut: () => void | Promise<void>;
  isMobile: boolean;
}

export default function AccountSidebar({
  tab,
  onTabChange,
  user,
  club,
  onSignOut,
  isMobile,
}: Props) {
  const { locale } = useLocale();
  const t = STR[locale];
  const isRTL = locale !== 'en';
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const displayName = user?.fullName ?? t.defaultUserName;
  const phoneAsName = displayName ? looksLikePhone(displayName) : false;
  const headingName = phoneAsName ? t.defaultUserName : displayName;
  const phoneLine = phoneAsName ? formatPhoneDisplay(displayName) : null;
  const membershipBadge =
    club?.isMember && club.level
      ? (TIER_LABEL[club.level]?.[locale] ?? club.level)
      : t.newMember;

  const sidebarNav = sidebarAccountNavItems(isMobile);

  async function confirmSignOut() {
    setLogoutConfirmOpen(false);
    setLogoutBusy(true);
    try {
      await onSignOut();
    } catch {
      // Local session cleanup/navigation is owned by the parent and remains
      // best-effort even when the revoke endpoint is temporarily unavailable.
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <aside
      data-testid="account-sidebar"
      style={{
        position: isMobile ? 'static' : 'sticky',
        top: isMobile ? 0 : 86,
        alignSelf: 'start',
        background: '#fff',
        border: '1px solid #e9eef4',
        borderRadius: 18,
        maxHeight: isMobile ? 'none' : 'calc(100vh - 106px)',
        overflow: isMobile ? 'hidden' : 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 44px -32px rgba(13,38,102,.55)',
      }}
    >
      <div
        style={{
          padding: '16px 15px 15px',
          background: 'linear-gradient(150deg,#123a62 0%,#0c243d 100%)',
          color: '#fff',
          flex: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'linear-gradient(135deg,#ffffff2e,#ffffff0f)',
              border: '1.5px solid #ffffff59',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <svg width="27" height="27" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5.33 0-9 2.69-9 6v2h18v-2c0-3.31-3.67-6-9-6z" />
            </svg>
          </div>
          <div style={{ minWidth: 0, lineHeight: 1.4 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>{headingName}</div>
            {phoneLine && (
              <div
                dir="ltr"
                style={{
                  marginTop: 4,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#c5d6eb',
                  letterSpacing: 0.2,
                }}
              >
                {phoneLine}
              </div>
            )}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 6,
                fontSize: 10,
                fontWeight: 700,
                color: '#f2d98a',
                background: '#ffffff17',
                border: '1px solid #ffffff29',
                padding: '3px 9px',
                borderRadius: 12,
                whiteSpace: 'nowrap',
              }}
            >
              {membershipBadge}
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff12',
            border: '1px solid #ffffff24',
            borderRadius: 12,
            padding: '9px 8px 9px 12px',
          }}
        >
          <div style={{ lineHeight: 1.35, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, color: '#aac4e2', whiteSpace: 'nowrap' }}>{t.loyaltyPoints}</div>
            <div style={{ fontSize: 16, fontWeight: 900, marginTop: 2, whiteSpace: 'nowrap' }}>
              {localeDigits(club?.balance ?? 0, locale)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onTabChange('wallet')}
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: '#0d2640',
              background: '#f2d98a',
              padding: '7px 11px',
              borderRadius: 9,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              border: 'none',
              fontFamily: 'inherit',
            }}
          >
            {t.walletLink} ›
          </button>
        </div>
      </div>
      <div
        style={{
          padding: 9,
          overflowY: isMobile ? 'hidden' : 'auto',
          overscrollBehavior: 'contain',
          flex: 1,
          minHeight: 0,
        }}
      >
        {sidebarNav.map((item, index) => (
          <div key={item.key}>
            {index > 0 && sidebarNav[index - 1]?.group !== item.group && (
              <div style={{ height: 1, background: '#eef1f5', margin: '11px 6px 7px' }} />
            )}
            <NavButton
              tabKey={item.key}
              label={item.label[locale]}
              active={tab === item.key}
              onSelect={() => onTabChange(item.key)}
              isRTL={isRTL}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        data-testid="account-logout"
        onClick={() => setLogoutConfirmOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          minHeight: 62,
          padding: '0 21px',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 700,
          color: '#e5484d',
          whiteSpace: 'nowrap',
          border: 'none',
          borderTop: '1px solid #eef1f5',
          background: 'transparent',
          fontFamily: 'inherit',
          flex: 'none',
        }}
      >
        <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </span>
        {t.logout}
      </button>
      <ConfirmActionDialog
        open={logoutConfirmOpen}
        title={t.logoutTitle}
        message={t.logoutMessage}
        confirmLabel={t.logoutConfirm}
        cancelLabel={t.logoutCancel}
        busy={logoutBusy}
        busyLabel={t.logoutBusy}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={confirmSignOut}
        variant="light"
        testId="account-logout-confirm"
      />
    </aside>
  );
}
