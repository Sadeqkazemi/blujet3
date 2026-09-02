import { useEffect, useState } from 'react';
import PublicPageShell from '../../components/public/PublicPageShell';
import { fetchPublicSiteContent } from '../../api/settings';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';

// درباره ما — static content matching design-reference/درباره ما.dc.html
// (fa/en/ar all directly provided by the design bundle's own strings).

interface Tr {
  fa: string;
  en: string;
  ar: string;
}

const STATS: { value: Tr; label: Tr }[] = [
  { value: { fa: '۴.۸M', en: '4.8M', ar: '٤٫٨M' }, label: { fa: 'مسافر سالانه', en: 'Passengers per year', ar: 'مسافر سنويًا' } },
  { value: { fa: '۳۲۰+', en: '320+', ar: '٣٢٠+' }, label: { fa: 'مسیر پروازی', en: 'Flight routes', ar: 'مسار طيران' } },
  { value: { fa: '۴۵', en: '45', ar: '٤٥' }, label: { fa: 'ایرلاین طرف قرارداد', en: 'Partner airlines', ar: 'شركة طيران شريكة' } },
  { value: { fa: '۲۴/۷', en: '24/7', ar: '٢٤/٧' }, label: { fa: 'پشتیبانی', en: 'Support', ar: 'الدعم' } },
];

const VALUES: { icon: string; title: Tr; desc: Tr; bg: string; color: string }[] = [
  { icon: '◎', title: { fa: 'شفافیت', en: 'Transparency', ar: 'الشفافية' }, desc: { fa: 'بدون هزینهٔ پنهان؛ قیمت نهایی همان است که می‌بینید.', en: 'No hidden fees — the final price is what you see.', ar: 'من دون رسوم خفية؛ السعر النهائي هو ما تراه.' }, bg: '#eef4fb', color: '#1668c4' },
  { icon: '⚡', title: { fa: 'سرعت', en: 'Speed', ar: 'السرعة' }, desc: { fa: 'خرید بلیط در کمتر از دو دقیقه و صدور آنی.', en: 'Ticket purchase in under two minutes with instant issuance.', ar: 'شراء التذكرة في أقل من دقيقتين مع إصدار فوري.' }, bg: '#fff7e6', color: '#caa53a' },
  { icon: '🛡', title: { fa: 'اعتماد', en: 'Trust', ar: 'الثقة' }, desc: { fa: 'درگاه پرداخت امن و حفاظت کامل از اطلاعات مسافران.', en: 'A secure payment gateway with full protection of passenger data.', ar: 'بوابة دفع آمنة وحماية كاملة لبيانات المسافرين.' }, bg: '#e8f5ee', color: '#1f8a5b' },
];

const STR: Record<StoredLocale, {
  eyebrow: string;
  heroTitle: string;
  heroDesc: string;
  missionTitle: string;
  missionDesc: string;
  visionTitle: string;
  visionDesc: string;
  valuesHeading: string;
}> = {
  fa: {
    eyebrow: 'درباره blujet',
    heroTitle: 'سفر را ساده، مطمئن و در دسترس می‌کنیم',
    heroDesc: 'blujet یک پلتفرم رزرو آنلاین بلیط هواپیماست که از سال ۱۳۹۲ با هدف ساده‌سازی تجربهٔ سفر هوایی برای مسافران ایرانی فعالیت می‌کند.',
    missionTitle: 'مأموریت ما',
    missionDesc: 'دسترس‌پذیر کردن سفر هوایی با شفاف‌ترین قیمت‌ها، فرایند خرید بدون پیچیدگی و خدماتی که در تمام مراحل سفر کنار مسافر است.',
    visionTitle: 'چشم‌انداز',
    visionDesc: 'تبدیل‌شدن به مرجع نخست رزرو سفر در منطقه با اتکا به فناوری، صداقت در قیمت‌گذاری و تجربهٔ کاربری بی‌نقص.',
    valuesHeading: 'ارزش‌های ما',
  },
  en: {
    eyebrow: 'About blujet',
    heroTitle: 'Making air travel simple, reliable, and accessible',
    heroDesc: 'blujet is an online flight booking platform that has been simplifying air travel for Iranian passengers since 2013.',
    missionTitle: 'Our Mission',
    missionDesc: 'Making air travel accessible with the most transparent pricing, an uncomplicated booking process, and services that stay with travelers at every step.',
    visionTitle: 'Our Vision',
    visionDesc: "Becoming the region's leading travel booking reference through technology, pricing honesty, and a flawless user experience.",
    valuesHeading: 'Our Values',
  },
  ar: {
    eyebrow: 'عن blujet',
    heroTitle: 'نجعل السفر الجوي بسيطًا وموثوقًا ومتاحًا',
    heroDesc: 'blujet منصة حجز تذاكر طيران عبر الإنترنت تعمل منذ عام ٢٠١٣ على تبسيط تجربة السفر الجوي للمسافرين الإيرانيين.',
    missionTitle: 'مهمتنا',
    missionDesc: 'إتاحة السفر الجوي بأكثر الأسعار شفافية، وعملية شراء بسيطة، وخدمات ترافق المسافر في كل مرحلة من رحلته.',
    visionTitle: 'الرؤية',
    visionDesc: 'أن نصبح المرجع الأول لحجز السفر في المنطقة عبر التكنولوجيا والصدق في التسعير وتجربة مستخدم لا تشوبها شائبة.',
    valuesHeading: 'قيمنا',
  },
};

export default function AboutPage() {
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const t = STR[locale];
  const [aboutText, setAboutText] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicSiteContent(locale)
      .then((res) => setAboutText(res.aboutUsText.trim() || null))
      .catch(() => {
        /* static fallback */
      });
  }, [locale]);

  const heroDesc = aboutText ?? t.heroDesc;
  const gridCols2 = isMobile ? '1fr' : '1fr 1fr';
  const gridCols3 = isMobile ? '1fr' : 'repeat(3,1fr)';
  const gridCols4 = isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)';

  return (
    <PublicPageShell>
      <section style={{ background: 'linear-gradient(150deg,#0d2640,#124a86)', color: '#fff', padding: '45px 22px 60px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'inline-block', background: '#ffffff22', border: '1px solid #ffffff44', padding: '6px 12px', borderRadius: 28, fontSize: '11.5px', fontWeight: 700, marginBottom: 18 }}>
            {t.eyebrow}
          </div>
          <h1 style={{ fontSize: isMobile ? 24 : 32, fontWeight: 900, margin: '0 0 14px', letterSpacing: '-.6px' }}>{t.heroTitle}</h1>
          <p style={{ fontSize: 14, color: '#c9dcf3', margin: 0, lineHeight: 1.95 }}>
            {heroDesc}
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1080, margin: '-30px auto 0', padding: '0 22px', position: 'relative' }}>
        <div style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, boxShadow: '0 18px 40px -22px rgba(13,38,102,.3)', display: 'grid', gridTemplateColumns: gridCols4 }}>
          {STATS.map((s) => (
            <div key={s.label.fa} style={{ padding: 18, textAlign: 'center', borderLeft: '1px solid #f2f4f7' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#1668c4' }}>{s.value[locale]}</div>
              <div style={{ fontSize: '11.5px', color: '#6b7585', marginTop: 4 }}>{s.label[locale]}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '37px 22px 8px', display: 'grid', gridTemplateColumns: gridCols2, gap: 18 }}>
        <div style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 18, padding: '22px 24px' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: '#eef4fb', color: '#1668c4', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 13 }}>
            🎯
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0d2640', margin: '0 0 9px' }}>{t.missionTitle}</h2>
          <p style={{ fontSize: 12.5, color: '#5a6678', margin: 0, lineHeight: 2 }}>
            {t.missionDesc}
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 18, padding: '22px 24px' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: '#fff7e6', color: '#caa53a', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 13 }}>
            🔭
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0d2640', margin: '0 0 9px' }}>{t.visionTitle}</h2>
          <p style={{ fontSize: 12.5, color: '#5a6678', margin: 0, lineHeight: 2 }}>
            {t.visionDesc}
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 22px 55px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 900, color: '#0d2640', margin: '0 0 18px', textAlign: 'center' }}>{t.valuesHeading}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols3, gap: 14 }}>
          {VALUES.map((v) => (
            <div key={v.title.fa} style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: '20px 18px', textAlign: 'center' }}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: v.bg, color: v.color, fontSize: 19, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                {v.icon}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0d2640', marginBottom: 7 }}>{v.title[locale]}</div>
              <div style={{ fontSize: 12, color: '#6b7585', lineHeight: 1.9 }}>{v.desc[locale]}</div>
            </div>
          ))}
        </div>
      </section>
    </PublicPageShell>
  );
}
