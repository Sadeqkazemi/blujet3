import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchMyBookings } from '../../../api/publicSite';
import PublicPageShell from '../../../components/public/PublicPageShell';
import { useAuth } from '../../../hooks/useAuth';
import { useLocale } from '../../../hooks/useLocale';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { localeDigits } from '../../../lib/locale-format';
import {
  pickTr,
  SERVICE_PAGES,
  SERVICE_SHARED_COPY,
  type ServicePageId,
} from './service-pages-copy';
import { filterServiceEligibleBookings } from './service-eligible-bookings';

type Props = { pageId: ServicePageId };

const FLIGHT_GATED_PAGES = new Set<ServicePageId>([
  'seat-selection',
  'extra-baggage',
]);

export default function ServiceInfoPage({ pageId }: Props) {
  const page = SERVICE_PAGES[pageId];
  const { locale } = useLocale();
  const { status } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [loginOpen, setLoginOpen] = useState(false);
  const [noFlightOpen, setNoFlightOpen] = useState(false);
  const [ctaBusy, setCtaBusy] = useState(false);
  const postLoginHandled = useRef(false);

  const s = SERVICE_SHARED_COPY;
  const grid2 = isMobile ? '1fr' : '1.1fr 0.9fr';
  const returnPath = `${page.path}?postLogin=1`;

  async function proceedSeatOrBaggage() {
    setCtaBusy(true);
    try {
      const bookings = await fetchMyBookings();
      const upcoming = filterServiceEligibleBookings(bookings);
      if (upcoming.length === 0) {
        setNoFlightOpen(true);
        return;
      }
      navigate(`/services/select?from=${pageId}`);
    } catch {
      setNoFlightOpen(true);
    } finally {
      setCtaBusy(false);
    }
  }

  async function handlePrimaryCta() {
    if (pageId === 'refund-info') {
      navigate('/manage-booking');
      return;
    }
    if (pageId === 'wheelchair' && status !== 'authenticated') {
      navigate('/support');
      return;
    }
    if (FLIGHT_GATED_PAGES.has(pageId)) {
      if (status !== 'authenticated') {
        setLoginOpen(true);
        return;
      }
      await proceedSeatOrBaggage();
      return;
    }
    if (status !== 'authenticated') {
      setLoginOpen(true);
      return;
    }
    navigate('/manage-booking');
  }

  useEffect(() => {
    if (!FLIGHT_GATED_PAGES.has(pageId)) return;
    if (status !== 'authenticated') return;
    if (searchParams.get('postLogin') !== '1') return;
    if (postLoginHandled.current) return;
    postLoginHandled.current = true;
    void proceedSeatOrBaggage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pageId, searchParams]);

  return (
    <PublicPageShell>
      <div
        data-testid="service-info-page"
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: isMobile ? '20px 16px 40px' : '28px 26px 48px',
        }}
      >
        <nav
          style={{ fontSize: 12.5, color: '#8a96a6', marginBottom: 22, display: 'flex', gap: 8, flexWrap: 'wrap' }}
          aria-label="breadcrumb"
        >
          <Link to="/" style={{ color: '#1668c4', textDecoration: 'none' }}>
            {pickTr(s.bcHome, locale)}
          </Link>
          <span>←</span>
          <span>{pickTr(s.bcServices, locale)}</span>
          <span>←</span>
          <span style={{ color: '#0d2640', fontWeight: 700 }}>
            {pickTr(page.breadcrumbLabel, locale)}
          </span>
        </nav>

        <div
          data-testid="service-hero-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: grid2,
            gap: isMobile ? 20 : 28,
            alignItems: 'start',
            marginBottom: isMobile ? 28 : 44,
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-block',
                background: '#eef4fb',
                color: '#1668c4',
                padding: '6px 12px',
                borderRadius: 20,
                fontSize: 11.5,
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              {pickTr(page.badge, locale)}
            </div>
            <h1
              style={{
                fontSize: isMobile ? 26 : 34,
                fontWeight: 900,
                color: '#0d2640',
                lineHeight: 1.35,
                margin: '0 0 16px',
              }}
            >
              {pickTr(page.heroTitle, locale)}
            </h1>
            <p style={{ fontSize: 14.5, lineHeight: 2, color: '#5a6678', margin: '0 0 24px', maxWidth: 520 }}>
              {pickTr(page.heroDesc, locale)}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <button
                type="button"
                data-testid="service-primary-cta"
                disabled={ctaBusy}
                onClick={() => void handlePrimaryCta()}
                style={{
                  padding: '12px 22px',
                  background: '#1668c4',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 13.5,
                  opacity: ctaBusy ? 0.7 : 1,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {pickTr(page.ctaPrimary, locale)}
              </button>
              <button
                type="button"
                onClick={() => navigate(pageId === 'wheelchair' ? '/support' : '/')}
                style={{
                  padding: '12px 22px',
                  background: '#fff',
                  color: '#1668c4',
                  border: '1.5px solid #d5e1f0',
                  borderRadius: 12,
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {pickTr(page.ctaSecondary, locale)}
              </button>
            </div>
          </div>

          <div
            style={{
              background: '#fff',
              border: '1px solid #eef1f5',
              borderRadius: 18,
              padding: '20px 18px',
              boxShadow: '0 12px 32px -20px rgba(13,38,64,.2)',
            }}
          >
            {page.sideNote && (
              <p style={{ fontSize: 12, color: '#5a6678', lineHeight: 1.85, margin: '0 0 14px' }}>
                {pickTr(page.sideNote, locale)}
              </p>
            )}
            {page.cards?.map((card) => (
              <div
                key={pickTr(card.title, locale)}
                style={{
                  borderTop: '1px solid #f0f2f6',
                  padding: '12px 0',
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0d2640' }}>
                  {pickTr(card.title, locale)}
                </div>
                <div style={{ fontSize: 12, color: '#6b7787', marginTop: 4 }}>
                  {pickTr(card.desc, locale)}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1668c4', marginTop: 6 }}>
                  {pickTr(card.price, locale)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {page.notice && (
          <div
            style={{
              background: '#fff9ee',
              border: '1px solid #f0dcae',
              borderRadius: 14,
              padding: '14px 18px',
              fontSize: 13,
              color: '#96701a',
              lineHeight: 1.85,
              marginBottom: 36,
            }}
          >
            {pickTr(page.notice, locale)}
          </div>
        )}

        <h2
          style={{
            fontSize: 21,
            fontWeight: 800,
            color: '#0d2640',
            textAlign: 'center',
            margin: '0 0 28px',
          }}
        >
          {pickTr(page.stepsTitle, locale)}
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)',
            gap: 16,
            marginBottom: 40,
          }}
        >
          {page.steps.map((step, i) => (
            <div
              key={i}
              style={{
                background: '#fff',
                border: '1px solid #eef1f5',
                borderRadius: 16,
                padding: '18px 16px',
                textAlign: 'center',
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
                  fontWeight: 900,
                  margin: '0 auto 12px',
                }}
              >
                {localeDigits(step.no, locale)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0d2640', marginBottom: 8 }}>
                {pickTr(step.title, locale)}
              </div>
              <div style={{ fontSize: 12.5, color: '#6b7787', lineHeight: 1.85 }}>
                {pickTr(step.desc, locale)}
              </div>
            </div>
          ))}
        </div>

        {page.cardsTitle && page.cards && page.id !== 'seat-selection' && (
          <>
            <h2
              style={{
                fontSize: 21,
                fontWeight: 800,
                color: '#0d2640',
                textAlign: 'center',
                margin: '0 0 22px',
              }}
            >
              {pickTr(page.cardsTitle, locale)}
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)',
                gap: 14,
                marginBottom: 40,
              }}
            >
              {page.cards.map((card) => (
                <div
                  key={pickTr(card.title, locale)}
                  style={{
                    background: '#fff',
                    border: '1px solid #eef1f5',
                    borderRadius: 14,
                    padding: 16,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0d2640' }}>
                    {pickTr(card.title, locale)}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7787', marginTop: 6, lineHeight: 1.8 }}>
                    {pickTr(card.desc, locale)}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1668c4', marginTop: 8 }}>
                    {pickTr(card.price, locale)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <h2
          style={{
            fontSize: 21,
            fontWeight: 800,
            color: '#0d2640',
            textAlign: 'center',
            margin: '0 0 20px',
          }}
        >
          {pickTr(page.faqTitle, locale)}
        </h2>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {page.faqs.map((faq, i) => (
            <details
              key={i}
              style={{
                background: '#fff',
                border: '1px solid #eef1f5',
                borderRadius: 12,
                padding: '12px 16px',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: '#0d2640',
                  listStyle: 'none',
                }}
              >
                {pickTr(faq.q, locale)}
              </summary>
              <p style={{ fontSize: 12.5, color: '#5a6678', lineHeight: 1.9, margin: '10px 0 0' }}>
                {pickTr(faq.a, locale)}
              </p>
            </details>
          ))}
        </div>
      </div>

      {loginOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(13,38,64,.55)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setLoginOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 20,
              padding: '28px 24px',
              maxWidth: 380,
              width: '100%',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontSize: 16.5, fontWeight: 800, color: '#0d2640', margin: '0 0 8px' }}>
              {pickTr(s.loginTitle, locale)}
            </h2>
            <p style={{ fontSize: 13, color: '#5a6678', lineHeight: 1.9, margin: '0 0 20px' }}>
              {pickTr(s.loginDesc, locale)}
            </p>
            <button
              type="button"
              onClick={() => navigate('/signin', { state: { from: returnPath } })}
              style={{
                width: '100%',
                padding: 14,
                background: '#1668c4',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {locale === 'en' ? 'Log in / Sign up' : locale === 'ar' ? 'تسجيل الدخول' : 'ورود / ثبت‌نام'}
            </button>
          </div>
        </div>
      )}

      {noFlightOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(13,38,64,.55)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setNoFlightOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 20,
              padding: '28px 24px',
              maxWidth: 380,
              width: '100%',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontSize: 16.5, fontWeight: 800, color: '#0d2640', margin: '0 0 8px' }}>
              {pickTr(s.noFlightTitle, locale)}
            </h2>
            <p style={{ fontSize: 13, color: '#5a6678', lineHeight: 1.9, margin: '0 0 20px' }}>
              {pickTr(s.noFlightDesc, locale)}
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              style={{
                width: '100%',
                padding: 14,
                background: '#1668c4',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {pickTr(s.noFlightCta, locale)}
            </button>
          </div>
        </div>
      )}
    </PublicPageShell>
  );
}
