import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicPageShell from '../../components/public/PublicPageShell';
import { useAuth } from '../../hooks/useAuth';
import { fetchClubPoints, joinClub } from '../../api/publicSite';
import { ApiRequestError } from '../../api/envelope';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatToman } from '../../lib/fa-format';

const TIER_LABEL: Record<string, Record<StoredLocale, string>> = {
  SILVER: { fa: 'نقره‌ای', en: 'Silver', ar: 'فضي' },
  GOLD: { fa: 'طلایی', en: 'Gold', ar: 'ذهبي' },
  PLATINUM: { fa: 'پلاتین', en: 'Platinum', ar: 'بلاتيني' },
};

// Public marketing page for the customer club — content matches
// design-reference/باشگاه مشتریان.dc.html. The design's client-side "join"
// modal is replaced with a login link: membership on this stack is earned
// through real purchases (points ledger), not a free-text signup form.

interface Item {
  value?: Record<StoredLocale, string>;
  title: Record<StoredLocale, string>;
  desc?: Record<StoredLocale, string>;
  icon?: string;
}

const STATS: Item[] = [
  { value: { fa: '۵٪', en: '5%', ar: '٥٪' }, title: { fa: 'کش‌بک در هر خرید', en: 'Cashback per purchase', ar: 'استرداد نقدي في كل عملية شراء' } },
  { value: { fa: '۲۰۰+', en: '200+', ar: '٢٠٠+' }, title: { fa: 'مقصد پروازی', en: 'Flight destinations', ar: 'وجهة طيران' } },
  { value: { fa: '۳', en: '3', ar: '٣' }, title: { fa: 'سطح عضویت', en: 'Membership tiers', ar: 'فئة العضوية' } },
  { value: { fa: '۲۴/۷', en: '24/7', ar: '٢٤/٧' }, title: { fa: 'پشتیبانی اعضا', en: 'Member support', ar: 'دعم الأعضاء' } },
];

interface Tier {
  name: Record<StoredLocale, string>;
  range: Record<StoredLocale, string>;
  border: string;
  head: string;
  perks: Record<StoredLocale, string>[];
}

const TIERS: Tier[] = [
  {
    name: { fa: 'نقره‌ای', en: 'Silver', ar: 'فضي' },
    range: { fa: '۰ تا ۵٬۰۰۰ امتیاز', en: '0–5,000 points', ar: 'من ٠ إلى ٥٬٠٠٠ نقطة' },
    border: '#e6eaf0',
    head: 'linear-gradient(135deg,#9aa7b8,#6f7d90)',
    perks: [
      { fa: '۲٪ کش‌بک در هر خرید', en: '2% cashback per purchase', ar: 'استرداد نقدي ٢٪ في كل عملية شراء' },
      { fa: 'جمع‌آوری امتیاز پایه', en: 'Base point accrual', ar: 'تجميع نقاط أساسي' },
      { fa: 'پشتیبانی اعضا', en: 'Member support', ar: 'دعم الأعضاء' },
      { fa: 'پیشنهادهای فصلی', en: 'Seasonal offers', ar: 'عروض موسمية' },
    ],
  },
  {
    name: { fa: 'طلایی', en: 'Gold', ar: 'ذهبي' },
    range: { fa: '۵٬۰۰۰ تا ۱۵٬۰۰۰ امتیاز', en: '5,000–15,000 points', ar: 'من ٥٬٠٠٠ إلى ١٥٬٠٠٠ نقطة' },
    border: '#caa53a',
    head: 'linear-gradient(135deg,#caa53a,#9a7d22)',
    perks: [
      { fa: '۵٪ کش‌بک در هر خرید', en: '5% cashback per purchase', ar: 'استرداد نقدي ٥٪ في كل عملية شراء' },
      { fa: 'ارتقای رایگان به بیزنس', en: 'Free upgrade to Business', ar: 'ترقية مجانية إلى درجة الأعمال' },
      { fa: 'پذیرش اختصاصی فرودگاه', en: 'Dedicated airport reception', ar: 'تسجيل وصول مخصص في المطار' },
      { fa: 'درخواست خودرو با تخفیف', en: 'Discounted car requests', ar: 'طلب سيارة بخصم' },
    ],
  },
  {
    name: { fa: 'پلاتین', en: 'Platinum', ar: 'بلاتيني' },
    range: { fa: 'بالای ۱۵٬۰۰۰ امتیاز', en: 'Above 15,000 points', ar: 'أكثر من ١٥٬٠٠٠' },
    border: '#1668c4',
    head: 'linear-gradient(135deg,#1668c4,#0d2640)',
    perks: [
      { fa: '۷٪ کش‌بک + هدایای ویژه', en: '7% cashback + special gifts', ar: 'استرداد نقدي ٧٪ + هدايا خاصة' },
      { fa: 'ارتقای تضمینی صندلی', en: 'Guaranteed seat upgrade', ar: 'ترقية مقعد مضمونة' },
      { fa: 'لانژ اختصاصی فرودگاه', en: 'Exclusive airport lounge', ar: 'صالة مطار حصرية' },
      { fa: 'مدیر سفر اختصاصی', en: 'Dedicated travel manager', ar: 'مدير سفر مخصص' },
    ],
  },
];

const CARD_STEPS: Item[] = [
  { value: { fa: '۱', en: '1', ar: '١' }, title: { fa: 'کسب امتیاز', en: 'Earn Points', ar: 'كسب النقاط' }, desc: { fa: 'با هر پرواز امتیاز جمع کنید تا به حد ۵٬۰۰۰ برسید.', en: 'Collect points on every flight until you reach 5,000.', ar: 'اجمع نقاطًا مع كل رحلة حتى تبلغ ٥٬٠٠٠ نقطة.' } },
  { value: { fa: '۲', en: '2', ar: '٢' }, title: { fa: 'ارسال درخواست', en: 'Submit Request', ar: 'إرسال الطلب' }, desc: { fa: 'درخواست صدور کارت برای ادمین سایت ارسال می‌شود.', en: 'Your card request is sent to the site admin.', ar: 'يُرسل طلب إصدار البطاقة إلى مسؤول الموقع.' } },
  { value: { fa: '۳', en: '3', ar: '٣' }, title: { fa: 'ارجاع برای تأیید', en: 'Referred for Approval', ar: 'الإحالة للموافقة' }, desc: { fa: 'ادمین درخواست را به رئیس هیئت مدیره یا مدیر ارشد ارجاع می‌دهد.', en: 'The admin refers the request to the Board Chair or Senior Manager.', ar: 'يحيل المسؤول الطلب إلى رئيس مجلس الإدارة أو المدير الأول.' } },
  { value: { fa: '۴', en: '4', ar: '٤' }, title: { fa: 'صدور کارت', en: 'Card Issued', ar: 'إصدار البطاقة' }, desc: { fa: 'پس از تأیید، کارت عضویت برای مسافر صادر می‌شود.', en: 'Once approved, the membership card is issued to the traveler.', ar: 'بعد الموافقة، تُصدر بطاقة العضوية للمسافر.' } },
];

const EARN: Item[] = [
  { icon: '✈', title: { fa: 'پرواز کنید', en: 'Fly', ar: 'سافر' }, desc: { fa: 'به ازای هر خرید بلیط امتیاز بگیرید.', en: 'Earn points with every ticket purchase.', ar: 'احصل على نقاط مع كل عملية شراء تذكرة.' } },
  { icon: '%', title: { fa: 'کش‌بک بگیرید', en: 'Get Cashback', ar: 'احصل على استرداد نقدي' }, desc: { fa: 'بخشی از مبلغ به کیف پول برمی‌گردد.', en: 'A portion of your payment returns to your wallet.', ar: 'يعود جزء من المبلغ إلى محفظتك.' } },
  { icon: '🎁', title: { fa: 'معرفی دوستان', en: 'Refer Friends', ar: 'دعوة الأصدقاء' }, desc: { fa: 'با دعوت دوستان امتیاز هدیه بگیرید.', en: 'Invite friends and earn bonus points.', ar: 'ادعُ أصدقاءك واحصل على نقاط إضافية.' } },
  { icon: '★', title: { fa: 'ماموریت‌ها', en: 'Missions', ar: 'المهام' }, desc: { fa: 'با تکمیل ماموریت‌ها امتیاز جمع کنید.', en: 'Complete missions to earn more points.', ar: 'أكمل المهام لجمع المزيد من النقاط.' } },
];

const SERVICES: (Item & { bg: string; color: string })[] = [
  { icon: '🚗', title: { fa: 'درخواست خودرو', en: 'Car Request', ar: 'طلب سيارة' }, desc: { fa: 'رزرو خودرو فرودگاه تا مقصد با تخفیف ویژه اعضا.', en: 'Book airport-to-destination car service at a special member discount.', ar: 'حجز سيارة من المطار إلى الوجهة بخصم خاص للأعضاء.' }, bg: '#eef4fb', color: '#1668c4' },
  { icon: '↑', title: { fa: 'ارتقای صندلی', en: 'Seat Upgrade', ar: 'ترقية المقعد' }, desc: { fa: 'ارتقای رایگان یا تخفیف‌دار به کلاس بیزنس.', en: 'Free or discounted upgrade to Business class.', ar: 'ترقية مجانية أو بخصم إلى درجة الأعمال.' }, bg: '#fff7e6', color: '#caa53a' },
  { icon: '⚑', title: { fa: 'پذیرش ویژه', en: 'Priority Reception', ar: 'استقبال خاص' }, desc: { fa: 'چک‌این سریع و پذیرش اختصاصی بدون صف.', en: 'Fast check-in and dedicated reception with no queues.', ar: 'تسجيل وصول سريع واستقبال حصري دون طابور.' }, bg: '#e8f5ee', color: '#1f8a5b' },
];

const STR: Record<StoredLocale, {
  heroBadge: string;
  heroTitle: string;
  heroDesc: string;
  joinFree: string;
  myAccount: string;
  tiersHeading: string;
  tiersSub: string;
  cardBadge: string;
  cardHeading: string;
  cardIntro: string;
  earnHeading: string;
  servicesHeading: string;
  memberPointsLabel: string;
}> = {
  fa: {
    heroBadge: 'باشگاه مشتریان blujet',
    heroTitle: 'هر پرواز، یک قدم به مزایای بیشتر',
    heroDesc: 'با هر سفر امتیاز جمع کنید، کش‌بک بگیرید و از خدمات اختصاصی مثل ارتقای رایگان، پذیرش ویژه‌ی فرودگاه و درخواست خودرو بهره‌مند شوید.',
    joinFree: 'عضویت رایگان',
    myAccount: 'حساب من',
    tiersHeading: 'سطوح عضویت',
    tiersSub: 'هر چه بیشتر پرواز کنید، به سطح بالاتر و مزایای بیشتر می‌رسید.',
    cardBadge: 'صدور کارت بلوجت',
    cardHeading: 'با رسیدن به حد امتیاز، کارت بگیرید',
    cardIntro: 'به محض رسیدن به آستانه‌ی ۵٬۰۰۰ امتیاز، واجد شرایط دریافت کارت عضویت می‌شوید. درخواست شما برای ادمین سایت ارسال و سپس برای تأیید به رئیس هیئت مدیره یا مدیر ارشد ارجاع می‌شود؛ پس از تأیید، کارت برای مسافر صادر می‌گردد.',
    earnHeading: 'چطور امتیاز بگیرم؟',
    servicesHeading: 'خدمات ویژه‌ی اعضا',
    memberPointsLabel: 'امتیاز باشگاه',
  },
  en: {
    heroBadge: 'blujet Loyalty Club',
    heroTitle: 'Every flight, one step closer to more rewards',
    heroDesc: 'Earn points on every trip, get cashback, and enjoy exclusive perks like free upgrades, priority airport service, and car requests.',
    joinFree: 'Join for Free',
    myAccount: 'My Account',
    tiersHeading: 'Membership Tiers',
    tiersSub: 'The more you fly, the higher your tier and the greater your rewards.',
    cardBadge: 'blujet Card Issuance',
    cardHeading: 'Reach the point threshold, get your card',
    cardIntro: 'Once you reach 5,000 points, you become eligible for a membership card. Your request is sent to the site admin and then referred to the Board Chair or Senior Manager for approval; once approved, the card is issued to the traveler.',
    earnHeading: 'How do I earn points?',
    servicesHeading: 'Exclusive Member Services',
    memberPointsLabel: 'Club points',
  },
  ar: {
    heroBadge: 'نادي عملاء blujet',
    heroTitle: 'كل رحلة خطوة أقرب لمزايا أكبر',
    heroDesc: 'اجمع نقاطًا مع كل رحلة، احصل على استرداد نقدي، واستمتع بخدمات حصرية مثل الترقية المجانية واستقبال مطار خاص وطلب السيارة.',
    joinFree: 'انضمام مجاني',
    myAccount: 'حسابي',
    tiersHeading: 'فئات العضوية',
    tiersSub: 'كلما زاد سفرك، ارتقيت إلى فئة أعلى وحصلت على مزايا أكبر.',
    cardBadge: 'إصدار بطاقة blujet',
    cardHeading: 'عند بلوغ حد النقاط، احصل على بطاقتك',
    cardIntro: 'بمجرد بلوغ عتبة ٥٬٠٠٠ نقطة، تصبح مؤهلاً للحصول على بطاقة العضوية. يُرسل طلبك إلى مسؤول الموقع ثم يُحال إلى رئيس مجلس الإدارة أو المدير الأول للموافقة؛ وبعد الموافقة، تُصدر البطاقة للمسافر.',
    earnHeading: 'كيف أجمع النقاط؟',
    servicesHeading: 'خدمات حصرية للأعضاء',
    memberPointsLabel: 'نقاط النادي',
  },
};

export default function PublicClubPage() {
  const { status, user } = useAuth();
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const t = STR[locale];
  const loggedIn = status === 'authenticated' && user?.role === 'USER';
  const [club, setClub] = useState<{ isMember: boolean; level: string | null; balance: number } | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!loggedIn) return;
    fetchClubPoints()
      .then(setClub)
      .catch(() => setClub(null));
  }, [loggedIn]);

  async function onJoin() {
    setJoinBusy(true);
    setJoinError(null);
    try {
      const membership = await joinClub();
      setClub({
        isMember: membership.isMember,
        level: membership.level,
        balance: membership.balance,
      });
    } catch (err) {
      setJoinError(
        err instanceof ApiRequestError
          ? err.message
          : locale === 'en'
            ? 'Could not join the club.'
            : 'عضویت در باشگاه انجام نشد.',
      );
    } finally {
      setJoinBusy(false);
    }
  }

  const gridCols3 = isMobile ? '1fr' : 'repeat(3,1fr)';
  const gridCols4 = isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)';

  return (
    <PublicPageShell>
      {/* Logged-in member status (design's member state) */}
      {loggedIn && club?.isMember && (
        <div data-testid="club-member-banner" style={{ background: '#0d2640' }}>
          <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 22px', flexWrap: 'wrap' }}>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>
              {user?.fullName} — <span style={{ color: '#e7c66b' }}>★ {TIER_LABEL[club.level ?? '']?.[locale] ?? club.level}</span>
            </span>
            <span style={{ color: '#c9dcf3', fontSize: 12.5 }}>
              {t.memberPointsLabel}: <b style={{ color: '#fff' }}>{formatToman(club.balance, locale)}</b>
            </span>
          </div>
        </div>
      )}
      {/* HERO */}
      <section style={{ background: 'linear-gradient(150deg,#0d2640,#1668c4)', color: '#fff', padding: '41px 22px 37px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'inline-block', background: '#ffffff22', border: '1px solid #ffffff44', padding: '6px 12px', borderRadius: 28, fontSize: '11.5px', fontWeight: 700, marginBottom: 20 }}>
            {t.heroBadge}
          </div>
          <h1 style={{ fontSize: isMobile ? 26 : 38, fontWeight: 900, margin: '0 0 16px', letterSpacing: '-.8px' }}>{t.heroTitle}</h1>
          <p style={{ fontSize: '15.5px', color: '#d6e4f7', margin: '0 0 28px', lineHeight: 1.85 }}>
            {t.heroDesc}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {!loggedIn && (
              <Link
                to="/signin"
                style={{ background: '#fff', color: '#1668c4', padding: '11px 24px', borderRadius: 12, fontSize: '13.5px', fontWeight: 800, textDecoration: 'none' }}
              >
                {t.joinFree}
              </Link>
            )}
            {loggedIn && club && !club.isMember && (
              <button
                type="button"
                data-testid="public-club-join"
                disabled={joinBusy}
                onClick={() => void onJoin()}
                style={{
                  background: '#fff',
                  color: '#1668c4',
                  padding: '11px 24px',
                  borderRadius: 12,
                  fontSize: '13.5px',
                  fontWeight: 800,
                  border: 'none',
                  cursor: joinBusy ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: joinBusy ? 0.7 : 1,
                }}
              >
                {t.joinFree}
              </button>
            )}
            <Link
              to={loggedIn ? '/account?tab=club' : '/signin'}
              style={{ textDecoration: 'none', background: '#ffffff22', border: '1px solid #ffffff55', color: '#fff', padding: '11px 21px', borderRadius: 12, fontSize: '13.5px', fontWeight: 700 }}
            >
              {t.myAccount}
            </Link>
          </div>
          {joinError && (
            <p style={{ marginTop: 14, color: '#ffd0d0', fontSize: 13 }}>{joinError}</p>
          )}
        </div>
      </section>

      {/* STATS STRIP */}
      <section style={{ maxWidth: 1320, margin: '-30px auto 0', padding: '0 26px', position: 'relative' }}>
        <div style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, boxShadow: '0 18px 40px -22px rgba(13,38,102,.3)', display: 'grid', gridTemplateColumns: gridCols4 }}>
          {STATS.map((s) => (
            <div key={s.title.fa} style={{ padding: 16, textAlign: 'center', borderLeft: '1px solid #f2f4f7' }}>
              <div style={{ fontSize: 25, fontWeight: 900, color: '#1668c4' }}>{s.value?.[locale]}</div>
              <div style={{ fontSize: '11.5px', color: '#6b7585', marginTop: 4 }}>{s.title[locale]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* TIERS */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '37px 22px 14px' }}>
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <h2 style={{ fontSize: 27, fontWeight: 900, color: '#0d2640', margin: '0 0 10px' }}>{t.tiersHeading}</h2>
          <p style={{ fontSize: '13.5px', color: '#6b7585', margin: 0 }}>{t.tiersSub}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols3, gap: 18 }}>
          {TIERS.map((tier) => (
            <div key={tier.name.fa} style={{ background: '#fff', border: `2px solid ${tier.border}`, borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ background: tier.head, color: '#fff', padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 900 }}>{tier.name[locale]}</div>
                <div style={{ fontSize: '11.5px', opacity: 0.9, marginTop: 4 }}>{tier.range[locale]}</div>
              </div>
              <div style={{ padding: 15 }}>
                {tier.perks.map((pk) => (
                  <div key={pk.fa} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', fontSize: 12, color: '#3b4554' }}>
                    <span style={{ color: '#1f8a5b', fontWeight: 800 }}>✓</span>
                    {pk[locale]}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* MEMBERSHIP CARD ISSUANCE */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '28px 22px 14px' }}>
        <div style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 18, padding: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ display: 'inline-block', background: '#eef4fb', color: '#1668c4', padding: '5px 11px', borderRadius: 20, fontSize: '11.5px', fontWeight: 800, marginBottom: 12 }}>
              {t.cardBadge}
            </div>
            <h2 style={{ fontSize: '21.5px', fontWeight: 900, color: '#0d2640', margin: '0 0 10px' }}>{t.cardHeading}</h2>
            <p style={{ fontSize: 13, color: '#6b7585', lineHeight: 1.8, maxWidth: 680, margin: '0 auto' }}>
              {t.cardIntro}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: gridCols4, gap: 11 }}>
            {CARD_STEPS.map((s) => (
              <div key={s.title.fa} style={{ textAlign: 'center', background: '#f7faff', border: '1px solid #e6eefb', borderRadius: 15, padding: '18px 13px' }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#1668c4', color: '#fff', fontWeight: 900, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 13px' }}>
                  {s.value?.[locale]}
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0d2640', marginBottom: 6 }}>{s.title[locale]}</div>
                <div style={{ fontSize: '11.5px', color: '#6b7585', lineHeight: 1.7 }}>{s.desc?.[locale]}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EARN */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '28px 22px 14px' }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0d2640', margin: '0 0 8px' }}>{t.earnHeading}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols4, gap: 14 }}>
          {EARN.map((e) => (
            <div key={e.title.fa} style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: '20px 16px', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: '#eef4fb', color: '#1668c4', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                {e.icon}
              </div>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0d2640', marginBottom: 6 }}>{e.title[locale]}</div>
              <div style={{ fontSize: '11.5px', color: '#6b7585', lineHeight: 1.7 }}>{e.desc?.[locale]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* MEMBER SERVICES */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '28px 22px 47px' }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0d2640', margin: '0 0 8px' }}>{t.servicesHeading}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols3, gap: 14 }}>
          {SERVICES.map((s) => (
            <div key={s.title.fa} style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 20 }}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: s.bg, color: s.color, fontSize: 19, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 13 }}>
                {s.icon}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0d2640', marginBottom: 7 }}>{s.title[locale]}</div>
              <div style={{ fontSize: 12, color: '#6b7585', lineHeight: 1.8 }}>{s.desc?.[locale]}</div>
            </div>
          ))}
        </div>
      </section>
    </PublicPageShell>
  );
}
