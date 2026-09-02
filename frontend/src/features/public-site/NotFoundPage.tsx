import { Link } from 'react-router-dom';
import PublicPageShell from '../../components/public/PublicPageShell';
import { localeDigits } from '../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';

/** صفحه 404 — design-reference-v2/صفحه 404.dc.html + homepage header/footer. */
const STR: Record<
  StoredLocale,
  {
    title: string;
    body: string;
    homeLink: string;
    searchLink: string;
    errorCodeLabel: string;
    errorCodeSuffix: string;
  }
> = {
  fa: {
    title: 'صفحه‌ای که دنبالش بودید پیدا نشد',
    body: 'به نظر می‌رسد این پرواز از مسیر خارج شده است. آدرس واردشده اشتباه است یا این صفحه جابه‌جا شده. می‌توانید به صفحهٔ اصلی برگردید یا پروازتان را دوباره جستجو کنید.',
    homeLink: 'بازگشت به صفحهٔ اصلی',
    searchLink: 'جستجوی پرواز',
    errorCodeLabel: 'کد خطا',
    errorCodeSuffix: 'صفحه یافت نشد',
  },
  en: {
    title: "The page you're looking for wasn't found",
    body: 'It looks like this flight went off course. The address you entered is wrong, or this page has moved. You can go back to the homepage or search for your flight again.',
    homeLink: 'Back to homepage',
    searchLink: 'Search flights',
    errorCodeLabel: 'Error code',
    errorCodeSuffix: 'Page not found',
  },
  ar: {
    title: 'الصفحة التي تبحث عنها غير موجودة',
    body: 'يبدو أن هذه الرحلة خرجت عن مسارها. العنوان الذي أدخلته خاطئ أو تم نقل هذه الصفحة. يمكنك العودة إلى الصفحة الرئيسية أو البحث عن رحلتك مجددًا.',
    homeLink: 'العودة إلى الصفحة الرئيسية',
    searchLink: 'البحث عن رحلة',
    errorCodeLabel: 'رمز الخطأ',
    errorCodeSuffix: 'الصفحة غير موجودة',
  },
};

export default function NotFoundPage() {
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const t = STR[locale];
  const isRtl = locale !== 'en';

  return (
    <PublicPageShell>
      <style>{`
        @keyframes float404 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-14px); }
        }
        @keyframes dash404 {
          to { stroke-dashoffset: -40; }
        }
        .nf-float { animation: float404 4s ease-in-out infinite; }
        .nf-dash { animation: dash404 1.6s linear infinite; }
      `}</style>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobile ? '32px 16px 48px' : '48px 26px 64px',
          minHeight: isMobile ? 'calc(100vh - 220px)' : 'calc(100vh - 280px)',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <div style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
          <div className="nf-float" style={{ position: 'relative', marginBottom: 14 }}>
            <div
              style={{
                fontSize: isMobile ? 'clamp(72px, 22vw, 110px)' : 'clamp(80px, 26vw, 150px)',
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: '-4px',
                background: 'linear-gradient(120deg,#1668c4,#3b8ae0)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {localeDigits(404, locale)}
            </div>
            <svg
              viewBox="0 0 320 80"
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 8,
                margin: '0 auto',
                width: 'min(280px, 90%)',
                height: 70,
                overflow: 'visible',
              }}
            >
              <path
                className="nf-dash"
                d="M20 60 C 90 60, 120 20, 180 26 C 240 32, 270 55, 300 30"
                fill="none"
                stroke="#c3d5ea"
                strokeWidth="2.5"
                strokeDasharray="6 8"
                strokeLinecap="round"
              />
              <g transform="translate(296,28) rotate(28)">
                <path d="M0 -9 L26 0 L0 9 L7 0 Z" fill="#1668c4" />
              </g>
            </svg>
          </div>

          <h1
            style={{
              fontSize: isMobile ? 20 : 24,
              fontWeight: 900,
              margin: '0 0 12px',
              color: '#16202e',
              lineHeight: 1.35,
            }}
          >
            {t.title}
          </h1>
          <p
            style={{
              fontSize: isMobile ? 13 : 14,
              color: '#5a6678',
              lineHeight: 2,
              margin: '0 0 28px',
            }}
          >
            {t.body}
          </p>

          <div
            style={{
              display: 'flex',
              gap: 11,
              justifyContent: 'center',
              flexWrap: 'wrap',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: 'stretch',
            }}
          >
            <Link
              to="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                height: 48,
                padding: '0 24px',
                background: '#1668c4',
                color: '#fff',
                borderRadius: 12,
                fontSize: 13.5,
                fontWeight: 800,
                textDecoration: 'none',
              }}
            >
              {t.homeLink}
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: isRtl ? undefined : 'scaleX(-1)' }}
                aria-hidden
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <Link
              to="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                height: 48,
                padding: '0 24px',
                background: '#fff',
                border: '1.5px solid #d5e1f0',
                color: '#0d2640',
                borderRadius: 12,
                fontSize: 13.5,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              {t.searchLink}
            </Link>
          </div>

          <div style={{ marginTop: 30, fontSize: 12, color: '#9aa4b2' }}>
            {t.errorCodeLabel}: {localeDigits(404, locale)} — {t.errorCodeSuffix}
          </div>
        </div>
      </main>
    </PublicPageShell>
  );
}
