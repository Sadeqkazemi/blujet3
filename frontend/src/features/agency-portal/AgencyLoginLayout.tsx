import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';

const GOLD = '#caa53a';
const NAVY = '#0d2640';

const FONT: Record<StoredLocale, string> = {
  fa: "'Vazirmatn Variable', Vazirmatn, sans-serif",
  ar: "'Vazirmatn Variable', Vazirmatn, sans-serif",
  en: 'Inter, system-ui, sans-serif',
};

const STR: Record<
  StoredLocale,
  {
    b2bBadge: string;
    visualTitle: string;
    visualSub: string;
    perks: string[];
    langLabel: string;
  }
> = {
  fa: {
    b2bBadge: 'پرتال همکاران',
    visualTitle: 'کسب‌وکار سفر خود را\nبا blujet رشد بده',
    visualSub:
      'به شبکه B2B blujet بپیوند و از نرخ‌های عمده، رزرو صندلی با اولویت و پشتیبانی اختصاصی آژانس بهره‌مند شو.',
    perks: ['نرخ عمده و خالص روی همه مسیرها', 'رزرو صندلی با اولویت', 'کارشناس اختصاصی حساب B2B'],
    langLabel: 'FA',
  },
  en: {
    b2bBadge: 'PARTNER PORTAL',
    visualTitle: 'Grow your travel\nbusiness with blujet',
    visualSub:
      "Join blujet's B2B network for wholesale fares, priority seat locking, and dedicated agency support.",
    perks: ['Wholesale net fares on every route', 'Priority manual seat locking', 'Dedicated B2B account manager'],
    langLabel: 'EN',
  },
  ar: {
    b2bBadge: 'بوابة الشركاء',
    visualTitle: 'طوّر أعمالك السياحية\nمع blujet',
    visualSub:
      'انضم إلى شبكة B2B في blujet للحصول على أسعار الجملة وحجز المقاعد ذي الأولوية ودعم مخصص للوكالات.',
    perks: ['أسعار جملة صافية على كل خط', 'قفل مقاعد بأولوية', 'مدير حساب B2B مخصص'],
    langLabel: 'AR',
  },
};

function cycleLocale(locale: StoredLocale): StoredLocale {
  return locale === 'fa' ? 'en' : locale === 'en' ? 'ar' : 'fa';
}

/** B2B partner login/signup shell — visual source:
 * design-reference «ثبت نام و ورود آژانس» (uploaded bundle). */
export function AgencyLoginLayout({
  children,
  headerExtras,
}: {
  children: ReactNode;
  headerExtras?: ReactNode;
}) {
  const { locale, setLocale } = useLocale();
  const isMobile = useIsMobile();
  const t = STR[locale];
  const dir = locale === 'en' ? 'ltr' : 'rtl';

  return (
    <div
      dir={dir}
      style={{
        fontFamily: FONT[locale],
        color: '#16202e',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? 16 : 26,
        background: '#f6f8fb',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes agencyPlaneFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-16px) rotate(-1.5deg); }
        }
        .agency-signin-plane { animation: agencyPlaneFloat 7s ease-in-out infinite; }
        .agency-signin-input:focus {
          outline: none;
          border-color: ${NAVY} !important;
          background: #f3f7fc !important;
        }
      `}</style>

      <div
        style={{
          width: 1000,
          maxWidth: '100%',
          background: '#fff',
          borderRadius: 26,
          overflow: 'hidden',
          boxShadow: '0 50px 110px -38px rgba(13,38,102,.4)',
          border: '1px solid #e4edf8',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '420px 1fr',
        }}
      >
        {!isMobile && (
          <div
            style={{
              background: `linear-gradient(160deg, ${NAVY}, #16406e)`,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '32px 30px',
              minHeight: 620,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -80,
                right: -60,
                width: 260,
                height: 260,
                borderRadius: '50%',
                background: '#ffffff14',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: -40,
                left: -50,
                width: 170,
                height: 170,
                borderRadius: '50%',
                background: '#ffffff0d',
              }}
            />
            <img
              src="/agency-signin-aircraft.png"
              alt=""
              className="agency-signin-plane"
              style={{
                position: 'absolute',
                top: '8%',
                right: '-28%',
                width: '150%',
                filter: 'drop-shadow(0 30px 40px rgba(5,18,36,.45))',
                pointerEvents: 'none',
                opacity: 0.9,
              }}
            />

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 9, zIndex: 1 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  background: GOLD,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: NAVY,
                  fontSize: 17,
                  fontWeight: 900,
                }}
              >
                ✈
              </div>
              <span style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>blujet</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: GOLD,
                  border: '1.3px solid rgba(202,165,58,.5)',
                  borderRadius: 20,
                  padding: '3px 10px',
                }}
              >
                {t.b2bBadge}
              </span>
            </div>

            <div style={{ position: 'relative', color: '#fff', zIndex: 1 }}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  lineHeight: 1.7,
                  marginBottom: 12,
                  whiteSpace: 'pre-line',
                }}
              >
                {t.visualTitle}
              </div>
              <p style={{ fontSize: 12, color: '#d6e4f7', lineHeight: 2.1, margin: '0 0 20px' }}>{t.visualSub}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {t.perks.map((text) => (
                  <div
                    key={text}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      fontSize: 12,
                      color: '#eaf1fb',
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 7,
                        background: 'rgba(202,165,58,.18)',
                        color: GOLD,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        flex: 'none',
                      }}
                    >
                      ✓
                    </span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            padding: isMobile ? '26px 22px 22px' : '34px 40px 28px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: isMobile ? undefined : 620,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 22,
              gap: 10,
            }}
          >
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: '#16202e' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: NAVY,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 16,
                }}
              >
                ✈
              </div>
              <span style={{ fontWeight: 900, fontSize: 16 }}>
                blujet <span style={{ color: GOLD, fontWeight: 800, fontSize: 12 }}>B2B</span>
              </span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {headerExtras}
              <button
                type="button"
                data-testid="agency-signin-lang"
                onClick={() => setLocale(cycleLocale(locale))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  color: '#5a6678',
                  border: '1.5px solid #e2e7ee',
                  borderRadius: 20,
                  padding: '7px 13px',
                  fontSize: 12,
                  fontWeight: 700,
                  background: '#fff',
                  fontFamily: 'inherit',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3c2.5 2.5 4 5.7 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.7-4-9s1.5-6.5 4-9z" />
                </svg>
                {t.langLabel}
              </button>
              {isMobile && (
                <Link
                  to="/"
                  aria-label="close"
                  style={{
                    display: 'flex',
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: '#f3f5f8',
                    color: '#5a6678',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 17,
                    textDecoration: 'none',
                  }}
                >
                  ×
                </Link>
              )}
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

export const AGENCY_LOGIN_GOLD = GOLD;
export const AGENCY_LOGIN_NAVY = NAVY;
