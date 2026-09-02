import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { formatLocaleDate, localeDigits } from '../../lib/locale-format';
import type { CustomerReferralDashboard, CustomerReferralInvite } from '../../types/public-site';

const STR: Record<
  StoredLocale,
  {
    heroTitle: string;
    heroSub: string;
    codeLbl: string;
    copy: string;
    share: string;
    copied: string;
    kpiInvited: string;
    kpiPoints: string;
    kpiBookings: string;
    listHdr: string;
    empty: string;
    statusSignedUp: string;
    statusRewarded: string;
  }
> = {
  fa: {
    heroTitle: 'دوستانت را دعوت کن، امتیاز بگیر',
    heroSub:
      'با هر دوستی که با کد شما ثبت‌نام کند و اولین پروازش را رزرو کند، ۵۰۰ امتیاز باشگاه دریافت می‌کنید.',
    codeLbl: 'کد معرف شما',
    copy: 'کپی کد',
    share: 'اشتراک‌گذاری لینک',
    copied: 'کد معرف کپی شد ✓',
    kpiInvited: 'دوست دعوت‌شده',
    kpiPoints: 'امتیاز کسب‌شده',
    kpiBookings: 'رزرو موفق',
    listHdr: 'دوستان دعوت‌شده',
    empty: 'هنوز دوستی با کد شما ثبت‌نام نکرده است.',
    statusSignedUp: 'در انتظار اولین رزرو',
    statusRewarded: 'رزرو انجام شد',
  },
  en: {
    heroTitle: 'Invite friends, earn points',
    heroSub:
      'Earn 500 club points for each friend who signs up with your code and completes their first booking.',
    codeLbl: 'Your referral code',
    copy: 'Copy code',
    share: 'Share link',
    copied: 'Referral code copied ✓',
    kpiInvited: 'Friends invited',
    kpiPoints: 'Points earned',
    kpiBookings: 'Successful bookings',
    listHdr: 'Invited friends',
    empty: 'No friends have signed up with your code yet.',
    statusSignedUp: 'Awaiting first booking',
    statusRewarded: 'Booking completed',
  },
  ar: {
    heroTitle: 'ادعُ أصدقاءك واكسب نقاطًا',
    heroSub:
      'احصل على 500 نقطة نادي لكل صديق يسجّل باستخدام رمزك ويكمل أول حجز.',
    codeLbl: 'رمز الإحالة',
    copy: 'نسخ الرمز',
    share: 'مشاركة الرابط',
    copied: 'تم نسخ رمز الإحالة ✓',
    kpiInvited: 'أصدقاء مدعوون',
    kpiPoints: 'النقاط المكتسبة',
    kpiBookings: 'حجوزات ناجحة',
    listHdr: 'الأصدقاء المدعوّون',
    empty: 'لم يسجّل أي صديق برمزك بعد.',
    statusSignedUp: 'بانتظار أول حجز',
    statusRewarded: 'تم الحجز',
  },
};

function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('');
}

function statusStyle(status: CustomerReferralInvite['status']): {
  label: keyof typeof STR.fa;
  color: string;
  bg: string;
} {
  if (status === 'REWARDED' || status === 'BOOKED') {
    return { label: 'statusRewarded', color: '#1f8a5b', bg: '#e7f6ee' };
  }
  return { label: 'statusSignedUp', color: '#9a6a16', bg: '#fff8ec' };
}

interface Props {
  data: CustomerReferralDashboard;
  copyNotice: string | null;
  onCopy: () => void;
  onShare: () => void;
}

export default function AccountReferralTab({
  data,
  copyNotice,
  onCopy,
  onShare,
}: Props) {
  const { locale } = useLocale();
  const t = STR[locale];
  const fmtNum = (n: number) => localeDigits(n, locale);

  return (
    <div
      data-testid="account-referral"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg,#1668c4,#0d3b66)',
          color: '#fff',
          borderRadius: 18,
          padding: 22,
        }}
      >
        <h2 style={{ fontSize: 19, fontWeight: 900, margin: '0 0 6px' }}>{t.heroTitle}</h2>
        <p
          style={{
            fontSize: 11.5,
            color: '#cfe0f2',
            margin: '0 0 18px',
            maxWidth: 430,
            lineHeight: 1.9,
          }}
        >
          {t.heroSub}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: '#ffffff1c',
              border: '1px solid #ffffff33',
              borderRadius: 12,
              padding: '11px 16px',
            }}
          >
            <span style={{ fontSize: 10.5, color: '#cfe0f2' }}>{t.codeLbl}</span>
            <span
              data-testid="referral-code"
              style={{
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: 1,
                fontFamily: 'Roboto Mono, monospace',
              }}
              dir="ltr"
            >
              {data.referralCode}
            </span>
          </div>
          <button
            type="button"
            data-testid="referral-copy"
            onClick={onCopy}
            style={{
              height: 44,
              padding: '0 16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              background: '#fff',
              color: '#0d3b66',
              fontSize: 12,
              fontWeight: 800,
              borderRadius: 11,
              cursor: 'pointer',
              border: 'none',
              fontFamily: 'inherit',
            }}
          >
            {t.copy}
          </button>
          <button
            type="button"
            data-testid="referral-share"
            onClick={onShare}
            style={{
              height: 44,
              padding: '0 16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              background: '#ffffff1c',
              border: '1px solid #ffffff44',
              color: '#fff',
              fontSize: 12,
              fontWeight: 800,
              borderRadius: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t.share}
          </button>
        </div>
        {copyNotice && (
          <p style={{ fontSize: 11.5, color: '#cfe0f2', margin: '12px 0 0' }}>{copyNotice}</p>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 13,
        }}
      >
        {(
          [
            ['kpi-invited', data.stats.invitedCount, t.kpiInvited, '#1668c4'],
            ['kpi-points', data.stats.pointsEarned, t.kpiPoints, '#caa53a'],
            ['kpi-bookings', data.stats.successfulBookings, t.kpiBookings, '#1f8a5b'],
          ] as const
        ).map(([testId, val, lbl, color]) => (
          <div
            key={testId}
            data-testid={testId}
            style={{
              background: '#fff',
              border: '1px solid #eef1f5',
              borderRadius: 14,
              padding: 16,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 900, color }}>{fmtNum(val)}</div>
            <div style={{ fontSize: 10.5, color: '#8a96a6', marginTop: 5 }}>{lbl}</div>
          </div>
        ))}
      </div>

      <div
        style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}
      >
        <h3 style={{ fontSize: 14.5, fontWeight: 800, margin: '0 0 16px' }}>{t.listHdr}</h3>
        {data.invites.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9aa4b2', margin: 0 }}>{t.empty}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.invites.map((f) => {
              const st = statusStyle(f.status);
              return (
                <div
                  key={f.id}
                  data-testid="referral-invite-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    border: '1px solid #eef1f5',
                    borderRadius: 12,
                    padding: '11px 13px',
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: '#eef4fb',
                      color: '#1668c4',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 12,
                      flex: 'none',
                    }}
                  >
                    {initials(f.fullName)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{f.fullName}</div>
                    <div style={{ fontSize: 10.5, color: '#9aa4b2' }}>
                      {formatLocaleDate(f.joinedAt, locale)}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: st.color,
                      background: st.bg,
                      padding: '4px 11px',
                      borderRadius: 16,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t[st.label]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
