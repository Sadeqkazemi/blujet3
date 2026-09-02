import { useState } from 'react';
import type { AppLinkId } from '../../../types/app-links';
import type { StoredLocale } from '../../../hooks/useLocale';

type PromoCopy = {
  loyaltyEyebrow: string;
  loyaltyTitle: string;
  loyaltySub: string;
  loyaltyCta: string;
  tierSilver: string;
  tierSilverRange: string;
  tierGold: string;
  tierGoldRange: string;
  tierPlatinum: string;
  tierPlatinumRange: string;
  appEyebrow: string;
  appTitle: string;
  appSub: string;
  appStore: string;
  googlePlay: string;
  bazaarMyket: string;
};

export default function HomePromoCarousel({
  locale,
  copy: t,
  appLinks,
  onLoyaltyClick,
}: {
  locale: StoredLocale;
  copy: PromoCopy;
  appLinks: { id: AppLinkId; url: string }[];
  onLoyaltyClick: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const isRTL = locale !== 'en';

  const appLinkMap = Object.fromEntries(appLinks.map((l) => [l.id, l.url])) as Partial<Record<AppLinkId, string>>;

  return (
    <section style={{ maxWidth: 1180, margin: '48px auto 0', padding: '0 26px' }}>
      <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', boxShadow: '0 18px 44px -28px rgba(13,38,102,.4)' }}>
        <div
          style={{
            display: 'flex',
            direction: 'ltr',
            transition: 'transform .45s cubic-bezier(.4,0,.2,1)',
            transform: `translateX(-${slide * 100}%)`,
          }}
        >
          <div style={{ flex: '0 0 100%', display: 'flex' }}>
            <div
              dir={isRTL ? 'rtl' : 'ltr'}
              style={{
                flex: 1,
                minHeight: 212,
                boxSizing: 'border-box',
                background: 'linear-gradient(120deg,#1668c4,#0d3b66)',
                padding: '26px 59px',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 20,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', top: -80, left: -40, width: 280, height: 280, borderRadius: '50%', background: '#ffffff14' }} />
              <div style={{ position: 'relative', maxWidth: 440 }}>
                <div style={{ display: 'inline-block', background: '#ffffff22', color: '#fff', padding: '5px 11px', borderRadius: 20, fontSize: '11.5px', fontWeight: 600, marginBottom: 14 }}>
                  {t.loyaltyEyebrow}
                </div>
                <h2 style={{ fontSize: '22.5px', fontWeight: 800, color: '#fff', margin: '0 0 10px', letterSpacing: '-.5px' }}>{t.loyaltyTitle}</h2>
                <p style={{ fontSize: 13, color: '#dce8f6', margin: '0 0 16px', lineHeight: 1.75 }}>{t.loyaltySub}</p>
                <button type="button" onClick={onLoyaltyClick} style={{ display: 'inline-block', padding: '10px 21px', background: '#fff', color: '#1668c4', borderRadius: 11, fontSize: 13, fontWeight: 800, cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}>
                  {t.loyaltyCta}
                </button>
              </div>
              <div style={{ position: 'relative', flex: 'none', display: 'flex', flexDirection: 'column', gap: 8, width: 290 }}>
                {[
                  ['#cbd5e1', t.tierSilver, t.tierSilverRange],
                  ['#e7c66b', t.tierGold, t.tierGoldRange],
                  ['#9fd2ff', t.tierPlatinum, t.tierPlatinumRange],
                ].map(([dot, name, range]) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff14', border: '1px solid #ffffff26', borderRadius: 12, padding: '9px 13px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#fff', fontWeight: 800, fontSize: '12.5px' }}>
                      <span style={{ width: 11, height: 11, borderRadius: '50%', background: dot }} />
                      {name}
                    </span>
                    <span style={{ color: '#cdd9ec', fontSize: '11.5px', fontWeight: 600 }}>{range}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ flex: '0 0 100%', display: 'flex' }}>
            <div
              dir={isRTL ? 'rtl' : 'ltr'}
              style={{
                flex: 1,
                minHeight: 212,
                boxSizing: 'border-box',
                background: '#fff',
                padding: '28px 75px 28px 59px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 30,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 300 }}>
                <div style={{ fontSize: '11.5px', color: '#1668c4', fontWeight: 700, marginBottom: 10 }}>{t.appEyebrow}</div>
                <h2 style={{ fontSize: '22.5px', fontWeight: 800, margin: '0 0 12px', color: '#0d2640', letterSpacing: '-.5px' }}>{t.appTitle}</h2>
                <p style={{ fontSize: 13, color: '#3f546b', lineHeight: 1.8, margin: '0 0 20px', maxWidth: 460 }}>{t.appSub}</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(['app_store', 'google_play', 'bazaar_myket'] as AppLinkId[]).map((id) => {
                    const url = appLinkMap[id];
                    const label = id === 'app_store' ? t.appStore : id === 'google_play' ? t.googlePlay : t.bazaarMyket;
                    const isBazaar = id === 'bazaar_myket';
                    const style: React.CSSProperties = {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      background: isBazaar ? '#fff' : '#0d2640',
                      color: isBazaar ? '#0d2640' : '#fff',
                      padding: '9px 16px',
                      borderRadius: 12,
                      fontSize: '12.5px',
                      fontWeight: 600,
                      border: isBazaar ? '1.5px solid #d5e1f0' : 'none',
                      textDecoration: 'none',
                      fontFamily: 'inherit',
                      cursor: url ? 'pointer' : 'default',
                    };
                    if (url) {
                      return (
                        <a key={id} href={url} target="_blank" rel="noopener noreferrer" data-testid={`app-link-${id}`} style={style}>
                          {!isBazaar && <span style={{ fontSize: '14.5px' }}>⬇</span>}
                          {label}
                        </a>
                      );
                    }
                    return (
                      <span key={id} data-testid={`app-link-${id}`} style={style}>
                        {!isBazaar && <span style={{ fontSize: '14.5px' }}>⬇</span>}
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div aria-hidden="true" style={{ flex: 'none', width: 230, height: 172, borderRadius: 18, background: 'linear-gradient(160deg,#cfe0f5,#e8eef6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 78, height: 142, borderRadius: 18, border: '5px solid #fff', background: 'linear-gradient(180deg,#1668c4,#0d3b66)', boxShadow: '0 14px 28px -14px rgba(13,59,102,.65)' }} />
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="Previous slide"
          onClick={() => setSlide((s) => (s === 0 ? 1 : 0))}
          style={{ position: 'absolute', top: '50%', right: 14, transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: '50%', background: '#fff', border: '1px solid #e6eaf0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 8px 20px -10px rgba(13,38,64,.35)', fontSize: 16, color: '#1668c4' }}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Next slide"
          onClick={() => setSlide((s) => (s === 0 ? 1 : 0))}
          style={{ position: 'absolute', top: '50%', left: 14, transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: '50%', background: '#fff', border: '1px solid #e6eaf0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 8px 20px -10px rgba(13,38,64,.35)', fontSize: 16, color: '#1668c4' }}
        >
          ›
        </button>

        <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => setSlide(i)}
              style={{ width: slide === i ? 26 : 8, height: 8, borderRadius: 8, background: slide === i ? '#1668c4' : '#c9d4e2', border: 'none', cursor: 'pointer', padding: 0 }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
