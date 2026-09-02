import { Link } from 'react-router-dom';
import PublicPageShell from '../../components/public/PublicPageShell';
import { localeDigits } from '../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';

/**
 * صفحه تعمیر و نگهداری — design-reference-v2/در حال تعمیر و نگهداری.dc.html
 * + homepage header/footer via PublicPageShell.
 * Static route at /maintenance (manual during planned downtime).
 */
const STR: Record<
  StoredLocale,
  {
    badge: string;
    title: string;
    body: string;
    etaLabel: string;
    etaValue: string;
    supportLabel: string;
  }
> = {
  fa: {
    badge: 'در حال به‌روزرسانی',
    title: 'سایت در حال تعمیر و نگهداری است',
    body: 'برای بهبود سرویس و ارتقای سامانه، سایت به‌طور موقت در دسترس نیست. کمی بعد دوباره در خدمت شما خواهیم بود. از صبوری شما سپاسگزاریم.',
    etaLabel: 'زمان تقریبی بازگشت:',
    etaValue: `حدود ${localeDigits(2, 'fa')} ساعت آینده`,
    supportLabel: 'پشتیبانی',
  },
  en: {
    badge: 'Updating',
    title: 'The site is under maintenance',
    body: "We're temporarily offline to improve our service and upgrade the system. We'll be back shortly. Thank you for your patience.",
    etaLabel: 'Estimated return:',
    etaValue: `in about ${localeDigits(2, 'en')} hours`,
    supportLabel: 'Support',
  },
  ar: {
    badge: 'جارٍ التحديث',
    title: 'الموقع قيد الصيانة',
    body: 'الموقع غير متاح مؤقتًا لتحسين الخدمة وتطوير النظام. سنعود قريبًا لخدمتكم. شكرًا لصبركم.',
    etaLabel: 'الوقت التقريبي للعودة:',
    etaValue: `خلال ${localeDigits(2, 'ar')} ساعات تقريبًا`,
    supportLabel: 'الدعم الفني',
  },
};

export default function MaintenancePage() {
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const t = STR[locale];

  return (
    <PublicPageShell>
      <style>{`
        @keyframes spinM { to { transform: rotate(360deg); } }
        @keyframes spinMr { to { transform: rotate(-360deg); } }
        @keyframes pulseM {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .mnt-spin { animation: spinM 9s linear infinite; transform-origin: center; }
        .mnt-spin-r { animation: spinMr 6s linear infinite; transform-origin: center; }
        .mnt-pulse { animation: pulseM 1.4s ease-in-out infinite; }
      `}</style>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobile ? '28px 16px 48px' : '40px 26px 64px',
          minHeight: isMobile ? 'calc(100vh - 220px)' : 'calc(100vh - 280px)',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <div style={{ maxWidth: 580, width: '100%', textAlign: 'center' }}>
          <div
            style={{
              position: 'relative',
              width: 'clamp(100px, 32vw, 150px)',
              height: 'clamp(100px, 32vw, 150px)',
              margin: '0 auto 26px',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                className="mnt-spin"
                width="90"
                height="90"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1668c4"
                strokeWidth="1.4"
                aria-hidden
              >
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
                <circle cx="12" cy="12" r="4.5" />
              </svg>
            </div>
            <div style={{ position: 'absolute', top: -4, left: -2, opacity: 0.55 }}>
              <svg
                className="mnt-spin-r"
                width="46"
                height="46"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#8fb4de"
                strokeWidth="1.5"
                aria-hidden
              >
                <path d="M12 4v2M12 18v2M4 12h2M18 12h2" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
          </div>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 11.5,
              fontWeight: 800,
              color: '#b26b00',
              background: '#fff3dd',
              border: '1px solid #f4dfae',
              padding: '6px 14px',
              borderRadius: 20,
              marginBottom: 18,
            }}
          >
            <span
              className="mnt-pulse"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#e0a020',
                flex: 'none',
              }}
            />
            {t.badge}
          </span>

          <h1
            style={{
              fontSize: 'clamp(20px, 5.5vw, 25px)',
              fontWeight: 900,
              margin: '0 0 13px',
              color: '#16202e',
              lineHeight: 1.35,
            }}
          >
            {t.title}
          </h1>
          <p
            style={{
              fontSize: isMobile ? 13 : 13.5,
              color: '#5a6678',
              lineHeight: 2,
              margin: '0 0 26px',
            }}
          >
            {t.body}
          </p>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: isMobile ? 10 : 14,
              background: '#fff',
              border: '1px solid #e9eef4',
              borderRadius: 14,
              padding: isMobile ? '12px 14px' : '14px 18px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              maxWidth: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1668c4"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span style={{ fontSize: 12.5, color: '#5a6678' }}>
                {t.etaLabel} <b style={{ color: '#16202e' }}>{t.etaValue}</b>
              </span>
            </div>
            {!isMobile && <div style={{ width: 1, height: 22, background: '#e9eef4', flex: 'none' }} />}
            <Link
              to="/support"
              style={{ fontSize: 12.5, fontWeight: 700, color: '#1668c4', textDecoration: 'none' }}
            >
              {t.supportLabel}
            </Link>
          </div>

          <div
            style={{
              marginTop: 30,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              justifyContent: 'center',
              fontSize: 12,
              color: '#9aa4b2',
              flexWrap: 'wrap',
            }}
          >
            <span dir="ltr">{localeDigits('021-91000000', locale)}</span>
            <span>·</span>
            <span dir="ltr">support@blujet.ir</span>
          </div>
        </div>
      </main>
    </PublicPageShell>
  );
}
