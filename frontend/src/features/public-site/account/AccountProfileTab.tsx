import type { AuthUser } from '../../../types/auth';
import { formatLocalePercent, localeMoney } from '../../../lib/fa-format';
import { localeDigits } from '../../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../../hooks/useLocale';
import type { BookingDetail, UserProfile } from '../../../types/public-site';
import type { TabKey } from './account-types';

const STR: Record<
  StoredLocale,
  {
    userCode: string;
    securityBtn: string;
    completionLabel: string;
    completionHint: string;
    incompleteHdr: string;
    incompleteSub: string;
    statTrips: string;
    statPoints: string;
    statWallet: string;
    statPassengers: string;
  }
> = {
  fa: {
    userCode: 'کد کاربری',
    securityBtn: 'تنظیمات امنیت',
    completionLabel: 'تکمیل پروفایل',
    completionHint: 'با تکمیل شماره گذرنامه و تأیید ایمیل، پروفایل را کامل کنید و ۲۰۰ امتیاز بگیرید.',
    incompleteHdr: 'پروفایل شما تکمیل نشده است',
    incompleteSub:
      'برای استفاده کامل از امکانات (رزرو سریع‌تر، احراز هویت و صدور کارت)، اطلاعات هویتی، ایمیل و آدرس خود را تکمیل کنید.',
    statTrips: 'سفرهای انجام‌شده',
    statPoints: 'امتیاز باشگاه',
    statWallet: 'موجودی کیف پول',
    statPassengers: 'مسافران ذخیره‌شده',
  },
  en: {
    userCode: 'User code',
    securityBtn: 'Security Settings',
    completionLabel: 'Profile Completion',
    completionHint: 'Complete your passport number and verify your email to finish your profile and earn 200 points.',
    incompleteHdr: 'Your profile is incomplete',
    incompleteSub:
      'Complete your identity, email, and address info to fully use the features (faster booking, verification, and card issuance).',
    statTrips: 'Completed Trips',
    statPoints: 'Loyalty Points',
    statWallet: 'Wallet Balance',
    statPassengers: 'Saved Passengers',
  },
  ar: {
    userCode: 'رمز المستخدم',
    securityBtn: 'إعدادات الأمان',
    completionLabel: 'تكامل الملف الشخصي',
    completionHint: 'أكمل رقم جواز السفر وتحقق من بريدك الإلكتروني لإكمال ملفك والحصول على 200 نقطة.',
    incompleteHdr: 'ملفك الشخصي غير مكتمل',
    incompleteSub:
      'أكمل معلومات هويتك وبريدك الإلكتروني وعنوانك لاستخدام جميع الميزات (حجز أسرع، التحقق، وإصدار البطاقة).',
    statTrips: 'الرحلات المكتملة',
    statPoints: 'نقاط الولاء',
    statWallet: 'رصيد المحفظة',
    statPassengers: 'المسافرون المحفوظون',
  },
};

function ProfileStat({
  label,
  value,
  accent,
  bg,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  accent: string;
  bg: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="profile-stat"
      onClick={onClick}
      style={{
        background: '#fff',
        border: '1px solid #eef1f5',
        borderRadius: 14,
        padding: '13px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'inherit',
        width: '100%',
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          background: bg,
          color: accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
        }}
      >
        {icon}
      </span>
      <div style={{ lineHeight: 1.5, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: '#16202e' }}>{value}</div>
        <div style={{ fontSize: 10, color: '#9aa4b2', whiteSpace: 'nowrap' }}>{label}</div>
      </div>
    </button>
  );
}

interface Props {
  user: AuthUser | null;
  profile: UserProfile | null;
  bookings: BookingDetail[] | null;
  clubBalance: number;
  walletBalanceIrr: string | null;
  passengerCount: number;
  isMobile: boolean;
  onNavigateTab: (tab: TabKey) => void;
}

export default function AccountProfileTab({
  user,
  profile,
  bookings,
  clubBalance,
  walletBalanceIrr,
  passengerCount,
  isMobile,
  onNavigateTab,
}: Props) {
  const { locale } = useLocale();
  const t = STR[locale];

  const displayName = profile?.fullName ?? user?.fullName ?? '—';
  const userCode = user ? `CM-${user.id.replace(/\D/g, '').slice(-4).padStart(4, '0')}` : '—';
  const completedTrips = bookings?.filter((b) => b.status === 'TICKETED').length ?? 0;
  const statsCols = isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)';

  return (
    <div data-testid="account-profile-tab" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          background: 'linear-gradient(135deg,#0d2640,#16406e)',
          color: '#fff',
          borderRadius: 18,
          padding: '20px 22px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#ffffff22',
              border: '2px solid #ffffff55',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5.33 0-9 2.69-9 6v2h18v-2c0-3.31-3.67-6-9-6z" />
            </svg>
          </div>
          <div style={{ lineHeight: 1.6, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{displayName}</div>
            <div style={{ fontSize: 11.5, color: '#aac4e2' }}>
              {t.userCode} <span dir="ltr">{userCode}</span>
            </div>
          </div>
          <button
            type="button"
            data-testid="profile-go-security"
            onClick={() => onNavigateTab('security')}
            style={{
              marginRight: 'auto',
              fontSize: 11.5,
              fontWeight: 700,
              background: '#ffffff1e',
              border: '1px solid #ffffff33',
              padding: '9px 14px',
              borderRadius: 11,
              cursor: 'pointer',
              color: '#fff',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {t.securityBtn}
          </button>
        </div>
        <div
          style={{
            marginTop: 16,
            background: '#ffffff14',
            border: '1px solid #ffffff22',
            borderRadius: 12,
            padding: '11px 14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
              marginBottom: 8,
            }}
          >
            <span style={{ color: '#aac4e2' }}>{t.completionLabel}</span>
            <span style={{ fontWeight: 800, color: '#f2d98a' }}>
              {profile
                ? formatLocalePercent(Math.round(profile.completionPct), locale)
                : '—'}
            </span>
          </div>
          <div style={{ height: 7, borderRadius: 6, background: '#ffffff1c', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, Math.round(profile?.completionPct ?? 0)))}%`,
                borderRadius: 6,
                background: 'linear-gradient(90deg,#f2d98a,#caa53a)',
              }}
            />
          </div>
          <div style={{ fontSize: 10, color: '#8fa9cc', marginTop: 7 }}>{t.completionHint}</div>
        </div>
      </div>

      {profile && profile.completionPct < 100 && (
        <div
          data-testid="profile-incomplete-notice"
          style={{
            background: 'linear-gradient(135deg,#fff8ec,#fef2e0)',
            border: '1px solid #f6e0bb',
            borderRadius: 16,
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 13,
            cursor: 'pointer',
          }}
          onClick={() => onNavigateTab('account-info')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onNavigateTab('account-info');
          }}
          role="button"
          tabIndex={0}
        >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#f0a83c',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3l7 3v5.5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3z" />
              <path d="M12 9v3M12 16h.01" />
            </svg>
          </span>
          <div style={{ lineHeight: 1.6 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#9a6a16' }}>{t.incompleteHdr}</div>
            <div style={{ fontSize: 11.5, color: '#b07f2a' }}>{t.incompleteSub}</div>
          </div>
        </div>
      )}

      <div data-testid="profile-stats-grid" style={{ display: 'grid', gridTemplateColumns: statsCols, gap: 11 }}>
        <ProfileStat
          label={t.statTrips}
          value={localeDigits(completedTrips, locale)}
          accent="#1668c4"
          bg="#eef4fb"
          onClick={() => onNavigateTab('trips')}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
            </svg>
          }
        />
        <ProfileStat
          label={t.statPoints}
          value={localeDigits(clubBalance, locale)}
          accent="#caa53a"
          bg="#fdf6e3"
          onClick={() => onNavigateTab('club')}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 15.9 6.8 18.6l1-5.8L3.5 8.7l5.9-.9z" />
            </svg>
          }
        />
        <ProfileStat
          label={t.statWallet}
          value={walletBalanceIrr ? localeMoney(walletBalanceIrr, locale) : '—'}
          accent="#1f8a5b"
          bg="#e9f6ef"
          onClick={() => onNavigateTab('wallet')}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="6" width="18" height="13" rx="2.5" />
              <path d="M3 10h18" />
              <circle cx="16.5" cy="14.5" r="1.3" fill="currentColor" stroke="none" />
            </svg>
          }
        />
        <ProfileStat
          label={t.statPassengers}
          value={localeDigits(passengerCount, locale)}
          accent="#7c5cd6"
          bg="#f1edfb"
          onClick={() => onNavigateTab('passengers')}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="9" cy="8" r="3.2" />
              <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" />
              <path d="M16 4.5a3.2 3.2 0 0 1 0 6.4" />
              <path d="M21 20c0-2.8-1.7-5-4-5.7" />
            </svg>
          }
        />
      </div>
    </div>
  );
}
