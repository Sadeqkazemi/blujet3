import { useEffect, useRef, useState } from 'react';
import PublicPageShell from '../../components/public/PublicPageShell';
import { fetchPublicSiteContent, fetchPublicSiteRules } from '../../api/settings';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatToman } from '../../lib/fa-format';
import type { SiteRuleCategory } from '../../types/site-pages';

// اطلاعات سفر / قوانین و مقررات — content matches
// design-reference/قوانین و مقررات.dc.html verbatim (fa/en/ar all provided
// directly by the design bundle's own dataFA/dataEN/dataAR arrays).

interface Tr {
  fa: string;
  en: string;
  ar: string;
}

interface Section {
  title: Tr;
  items: Tr[];
}

const SECTIONS: Section[] = [
  {
    title: { fa: 'خرید و صدور بلیط', en: 'Purchase & Ticket Issuance', ar: 'الشراء وإصدار التذكرة' },
    items: [
      { fa: 'قیمت نمایش‌داده‌شده شامل مالیات و عوارض است و هزینهٔ پنهانی وجود ندارد.', en: 'The displayed price includes tax and fees; there are no hidden charges.', ar: 'يشمل السعر المعروض الضرائب والرسوم، ولا توجد أي رسوم خفية.' },
      { fa: 'پس از پرداخت موفق، بلیط الکترونیکی بلافاصله صادر و به ایمیل و شمارهٔ موبایل شما ارسال می‌شود.', en: 'After a successful payment, the e-ticket is issued immediately and sent to your email and mobile number.', ar: 'بعد نجاح الدفع، تصدر التذكرة الإلكترونية فورًا وتُرسل إلى بريدك الإلكتروني ورقم هاتفك المحمول.' },
      { fa: 'مسئولیت صحت اطلاعات هویتی مسافران (نام، نام خانوادگی و کد ملی/گذرنامه) بر عهدهٔ خریدار است.', en: "The buyer is responsible for the accuracy of passengers' identity details (full name and national ID/passport).", ar: 'يتحمل المشتري مسؤولية صحة بيانات هوية المسافرين (الاسم واللقب ورقم الهوية/جواز السفر).' },
    ],
  },
  {
    title: { fa: 'استرداد و کنسلی', en: 'Refunds & Cancellation', ar: 'الاسترداد والإلغاء' },
    items: [
      { fa: 'میزان جریمهٔ استرداد بر اساس نوع نرخ بلیط و سیاست ایرلاین تعیین می‌شود.', en: "The refund penalty amount is determined by the ticket fare type and the airline's policy.", ar: 'تُحدَّد نسبة غرامة الاسترداد حسب نوع سعر التذكرة وسياسة شركة الطيران.' },
      { fa: 'درخواست استرداد از بخش «مدیریت رزرو» قابل ثبت است و مبلغ قابل بازگشت پیش از تأیید نمایش داده می‌شود.', en: 'Refund requests can be filed under "Manage Booking"; the refundable amount is shown before confirmation.', ar: 'يمكن تقديم طلب الاسترداد من قسم «إدارة الحجز»، ويُعرض المبلغ القابل للاسترداد قبل التأكيد.' },
      { fa: 'بازگشت وجه حداکثر ظرف ۷۲ ساعت کاری به حساب پرداخت‌کننده انجام می‌شود.', en: "Refunds are issued to the payer's account within a maximum of 72 business hours.", ar: 'يُعاد المبلغ إلى حساب الدافع خلال ٧٢ ساعة عمل كحد أقصى.' },
    ],
  },
  {
    title: { fa: 'تغییر تاریخ و مشخصات', en: 'Date & Detail Changes', ar: 'تغيير التاريخ والبيانات' },
    items: [
      { fa: 'تغییر تاریخ پرواز در صورت موجود بودن ظرفیت و مطابق قوانین نرخ امکان‌پذیر است.', en: 'Changing the flight date is possible subject to seat availability and fare rules.', ar: 'يمكن تغيير تاريخ الرحلة في حال توفر مقاعد ووفقًا لقواعد السعر.' },
      { fa: 'اصلاح خطای تایپی در نام مسافر تا پیش از بستن فروش پرواز قابل انجام است.', en: "Correcting a typo in a passenger's name is possible until flight sales close.", ar: 'يمكن تصحيح الأخطاء الإملائية في اسم المسافر قبل إغلاق حجوزات الرحلة.' },
    ],
  },
  {
    title: { fa: 'بار و چک‌این', en: 'Baggage & Check-in', ar: 'الأمتعة وتسجيل الوصول' },
    items: [
      { fa: 'بار مجاز رایگان در نرخ اکونومی ۲۰ و در نرخ بیزنس ۴۰ کیلوگرم است.', en: 'The free baggage allowance is 20kg in Economy and 40kg in Business.', ar: 'الأمتعة المجانية المسموح بها ٢٠ كجم في الدرجة الاقتصادية و٤٠ كجم في درجة الأعمال.' },
      { fa: 'چک‌این آنلاین از ۲۴ تا ۵ ساعت پیش از پرواز فعال است.', en: 'Online check-in is open from 24 hours to 5 hours before the flight.', ar: 'يُفتح تسجيل الوصول عبر الإنترنت من ٢٤ إلى ٥ ساعات قبل الرحلة.' },
      { fa: 'حمل اقلام ممنوعه طبق فهرست سازمان هواپیمایی کشوری اکیداً ممنوع است.', en: "Carrying prohibited items per the Civil Aviation Organization's list is strictly forbidden.", ar: 'يُمنع منعًا باتًا حمل المواد المحظورة وفق قائمة منظمة الطيران المدني.' },
    ],
  },
  {
    title: { fa: 'باشگاه مشتریان', en: 'Loyalty Club', ar: 'نادي العملاء' },
    items: [
      { fa: 'امتیازها با هر خرید به‌صورت خودکار محاسبه و در پنل کاربری ثبت می‌شوند.', en: 'Points are calculated automatically with every purchase and recorded in your account.', ar: 'تُحتسب النقاط تلقائيًا مع كل عملية شراء وتُسجَّل في لوحة حسابك.' },
      { fa: 'امتیازها قابل تبدیل به تخفیف، بار اضافه و ارتقای صندلی هستند و تاریخ انقضا دارند.', en: 'Points can be converted into discounts, extra baggage, and seat upgrades, and they have an expiry date.', ar: 'يمكن تحويل النقاط إلى خصومات وأمتعة إضافية وترقية مقعد، وهي ذات تاريخ انتهاء صلاحية.' },
    ],
  },
  {
    title: { fa: 'حریم خصوصی و امنیت', en: 'Privacy & Security', ar: 'الخصوصية والأمان' },
    items: [
      { fa: 'اطلاعات شخصی و پرداخت کاربران با پروتکل‌های رمزنگاری محافظت می‌شود.', en: "Users' personal and payment information is protected with encryption protocols.", ar: 'تُحمى بياناتك الشخصية وبيانات الدفع بواسطة بروتوكولات تشفير.' },
      { fa: 'پرداخت‌ها صرفاً از طریق درگاه‌های بانکی معتبر انجام می‌گیرد و اطلاعات کارت نزد ما ذخیره نمی‌شود.', en: 'Payments are processed only through licensed banking gateways; card details are never stored with us.', ar: 'تتم عمليات الدفع فقط عبر بوابات بنكية معتمدة، ولا تُحفظ بيانات البطاقة لدينا.' },
    ],
  },
];

const STR: Record<StoredLocale, { heroTitle: string; heroSub: string; toc: string; warningNote: string }> = {
  fa: {
    heroTitle: 'قوانین و مقررات',
    heroSub: 'آخرین به‌روزرسانی: ۱ تیر ۱۴۰۵ · لطفاً پیش از خرید بلیط مطالعه فرمایید.',
    toc: 'فهرست',
    warningNote: 'قوانین استرداد و تغییر بسته به نوع نرخ بلیط و سیاست هر ایرلاین متفاوت است. مبلغ دقیق قابل بازگشت در مرحلهٔ استرداد در بخش «مدیریت رزرو» به شما نمایش داده می‌شود.',
  },
  en: {
    heroTitle: 'Terms & Conditions',
    heroSub: 'Last updated: June 22, 2026 · Please read before purchasing a ticket.',
    toc: 'Contents',
    warningNote: 'Refund and change rules vary by ticket fare type and each airline\'s policy. The exact refundable amount is shown to you at the refund step under "Manage Booking".',
  },
  ar: {
    heroTitle: 'الشروط والأحكام',
    heroSub: 'آخر تحديث: ٢٢ يونيو ٢٠٢٦ · يُرجى القراءة قبل شراء التذكرة.',
    toc: 'المحتويات',
    warningNote: 'تختلف قواعد الاسترداد والتغيير حسب نوع سعر التذكرة وسياسة كل شركة طيران. يُعرض المبلغ الدقيق القابل للاسترداد في خطوة الاسترداد ضمن «إدارة الحجز».',
  },
};

export default function TravelInfoPage() {
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const t = STR[locale];
  const [active, setActive] = useState(0);
  const [termsIntro, setTermsIntro] = useState<string | null>(null);
  const [publishedRules, setPublishedRules] = useState<SiteRuleCategory[] | null>(null);
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    fetchPublicSiteContent(locale)
      .then((res) => setTermsIntro(res.termsText.trim() || null))
      .catch(() => {
        /* static fallback */
      });
  }, [locale]);

  useEffect(() => {
    setPublishedRules(null);
    fetchPublicSiteRules(locale)
      .then((result) => {
        if (locale === 'fa' && result.categories.length > 0) {
          setPublishedRules(result.categories);
        }
      })
      .catch(() => {
        /* approved static fallback */
      });
  }, [locale]);

  const displayedSections: Section[] =
    locale === 'fa' && publishedRules
      ? publishedRules.map((rule) => ({
          title: { fa: rule.title, en: rule.title, ar: rule.title },
          items: rule.text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => ({ fa: line, en: line, ar: line })),
        }))
      : SECTIONS;

  return (
    <PublicPageShell>
      <section style={{ background: 'linear-gradient(150deg,#0d2640,#124a86)', color: '#fff', padding: '39px 22px 35px', textAlign: 'center' }}>
        <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 900, margin: '0 0 10px', letterSpacing: '-.5px' }}>{t.heroTitle}</h1>
        <p style={{ fontSize: 13, color: '#c9dcf3', margin: 0 }}>{t.heroSub}</p>
        {termsIntro && (
          <p data-testid="terms-cms-intro" style={{ fontSize: 12.5, color: '#e2edf9', margin: '14px auto 0', maxWidth: 640, lineHeight: 1.9 }}>
            {termsIntro}
          </p>
        )}
      </section>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '31px 22px 47px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '250px 1fr', gap: 24, alignItems: 'start' }}>
        {/* TOC */}
        <div style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 15, padding: 9, position: isMobile ? 'static' : 'sticky', top: 100 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#8a96a6', padding: '8px 11px 6px' }}>{t.toc}</div>
          {displayedSections.map((s, i) => (
            <button
              key={s.title.fa}
              onClick={() => {
                setActive(i);
                sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: locale === 'en' ? 'left' : 'right',
                padding: '9px 11px',
                borderRadius: 9,
                border: 'none',
                background: active === i ? '#eef4fb' : 'transparent',
                color: active === i ? '#1668c4' : '#5a6678',
                fontWeight: active === i ? 800 : 600,
                fontSize: 12.5,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {s.title[locale]}
            </button>
          ))}
        </div>

        {/* SECTIONS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {displayedSections.map((s, i) => (
            <div
              key={s.title.fa}
              ref={(el) => {
                sectionRefs.current[i] = el;
              }}
              style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: '19px 21px', scrollMarginTop: 100 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13 }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, background: '#eef4fb', color: '#1668c4', fontWeight: 900, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  {formatToman(i + 1, locale)}
                </span>
                <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0d2640', margin: 0 }}>{s.title[locale]}</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {s.items.map((it) => (
                  <div key={it.fa} style={{ display: 'flex', gap: 9, fontSize: 12.5, color: '#3b4554', lineHeight: 1.9 }}>
                    <span style={{ color: '#1668c4', flex: 'none' }}>•</span>
                    {it[locale]}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div style={{ background: '#fff7e6', border: '1px solid #f2dfb0', borderRadius: 14, padding: '15px 18px', display: 'flex', gap: 11, fontSize: 12, color: '#7d651e', lineHeight: 1.9 }}>
            <span style={{ flex: 'none' }}>⚠️</span>
            {t.warningNote}
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}
