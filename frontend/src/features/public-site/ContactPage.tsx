import { useEffect, useState } from 'react';
import PublicPageShell from '../../components/public/PublicPageShell';
import { submitContactMessage } from '../../api/contact';
import { fetchPublicSupportContact, fetchPublicSiteContent } from '../../api/settings';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';
import { arDigits, faDigits } from '../../lib/fa-format';

// تماس با ما — content matching design-reference/تماس با ما.dc.html.
// The design's own form requires name+phone+subject+msg (see its onSend
// validation) — the earlier build of this page was missing the subject
// field; Phase 20 adds it back and wires the form to a real backend.
// EN strings come from the design bundle's own isEN ternaries; the design
// has no isAR branch for this page's content (arDeep also lacks entries
// for most of it) — every Arabic string below was hand-translated fresh,
// same quality bar as every other page, no silent Persian fallback.

interface Tr {
  fa: string;
  en: string;
  ar: string;
}

const FALLBACK_SUPPORT = {
  phone: '021 — 91000000',
  email: 'support@blujet.ir',
};

function formatSupportPhone(phone: string, locale: StoredLocale): string {
  if (locale === 'en') return phone;
  if (locale === 'ar') return arDigits(phone);
  return faDigits(phone);
}

const STATIC_CHANNELS: { icon: string; bg: string; color: string; title: Tr; value: Tr; ltr: boolean; kind: 'address' | 'hours' }[] = [
  { icon: '📍', bg: '#eef9f1', color: '#1f8a5b', title: { fa: 'دفتر مرکزی', en: 'Head Office', ar: 'المكتب الرئيسي' }, value: { fa: 'تهران، خیابان ولیعصر، برج blujet، طبقه ۱۲', en: 'Tehran, Valiasr St, blujet Tower, 12th Floor', ar: 'طهران، شارع ولي‌عصر، برج blujet، الطابق ١٢' }, ltr: false, kind: 'address' },
  { icon: '🕑', bg: '#fbf0ef', color: '#d64545', title: { fa: 'ساعات کاری دفتر', en: 'Office Hours', ar: 'ساعات عمل المكتب' }, value: { fa: 'شنبه تا چهارشنبه، ۸ تا ۱۷', en: 'Saturday to Wednesday, 8 to 17', ar: 'من السبت إلى الأربعاء، من الساعة ٨ إلى ١٧' }, ltr: false, kind: 'hours' },
];

const SUPPORT_CHANNEL_META = {
  phone: {
    icon: '☎',
    bg: '#eef4fb',
    color: '#1668c4',
    title: { fa: 'تلفن پشتیبانی ۲۴ ساعته', en: '24-Hour Support Line', ar: 'خط الدعم على مدار الساعة' },
    ltr: true,
  },
  email: {
    icon: '✉',
    bg: '#fbf6ea',
    color: '#c47d1a',
    title: { fa: 'ایمیل', en: 'Email', ar: 'البريد الإلكتروني' },
    ltr: true,
  },
} as const;

const STR: Record<StoredLocale, {
  heroTitle: string;
  heroDesc: string;
  formHeading: string;
  formSub: string;
  sentTitle: string;
  sentBody: string;
  namePlaceholder: string;
  phonePlaceholder: string;
  subjectPlaceholder: string;
  msgPlaceholder: string;
  sendLabel: string;
}> = {
  fa: {
    heroTitle: 'تماس با ما',
    heroDesc: 'هر ساعت از شبانه‌روز پاسخگوی شما هستیم.',
    formHeading: 'ارسال پیام',
    formSub: 'فرم را پر کنید؛ در سریع‌ترین زمان با شما تماس می‌گیریم.',
    sentTitle: 'پیام شما ارسال شد',
    sentBody: 'کارشناسان ما به‌زودی با شما تماس می‌گیرند.',
    namePlaceholder: 'نام و نام خانوادگی',
    phonePlaceholder: 'شماره تماس',
    subjectPlaceholder: 'موضوع',
    msgPlaceholder: 'متن پیام…',
    sendLabel: 'ارسال پیام',
  },
  en: {
    heroTitle: 'Contact Us',
    heroDesc: "We're here to help you around the clock.",
    formHeading: 'Send a Message',
    formSub: "Fill out the form; we'll contact you as soon as possible.",
    sentTitle: 'Your message has been sent',
    sentBody: 'Our team will contact you soon.',
    namePlaceholder: 'Full Name',
    phonePlaceholder: 'Phone Number',
    subjectPlaceholder: 'Subject',
    msgPlaceholder: 'Your message…',
    sendLabel: 'Send Message',
  },
  ar: {
    heroTitle: 'اتصل بنا',
    heroDesc: 'نحن هنا لمساعدتك على مدار الساعة.',
    formHeading: 'إرسال رسالة',
    formSub: 'املأ النموذج؛ سنتواصل معك في أقرب وقت ممكن.',
    sentTitle: 'تم إرسال رسالتك',
    sentBody: 'سيتواصل معك فريقنا قريبًا.',
    namePlaceholder: 'الاسم الكامل',
    phonePlaceholder: 'رقم الهاتف',
    subjectPlaceholder: 'الموضوع',
    msgPlaceholder: 'نص الرسالة…',
    sendLabel: 'إرسال رسالة',
  },
};

const ERR: Record<StoredLocale, string> = {
  fa: 'خطا در ارسال پیام.',
  en: 'Error sending the message.',
  ar: 'خطأ في إرسال الرسالة.',
};

export default function ContactPage() {
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const t = STR[locale];
  const [supportContact, setSupportContact] = useState(FALLBACK_SUPPORT);
  const [officeAddress, setOfficeAddress] = useState<string | null>(null);
  const [officeHours, setOfficeHours] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = name.trim() && phone.trim() && subject.trim() && msg.trim();

  useEffect(() => {
    fetchPublicSupportContact()
      .then((res) => {
        setSupportContact({
          phone: res.phone.trim() || FALLBACK_SUPPORT.phone,
          email: res.email.trim() || FALLBACK_SUPPORT.email,
        });
      })
      .catch(() => {
        /* keep static fallbacks */
      });
    fetchPublicSiteContent(locale)
      .then((res) => {
        setOfficeAddress(res.contactAddress.trim() || null);
        setOfficeHours(res.contactOfficeHours.trim() || null);
      })
      .catch(() => {
        /* keep static fallbacks */
      });
  }, [locale]);

  const channels = [
    {
      ...SUPPORT_CHANNEL_META.phone,
      value: formatSupportPhone(supportContact.phone, locale),
    },
    {
      ...SUPPORT_CHANNEL_META.email,
      value: supportContact.email,
    },
    ...STATIC_CHANNELS.map((c) => ({
      ...c,
      value:
        c.kind === 'address' && officeAddress
          ? officeAddress
          : c.kind === 'hours' && officeHours
            ? officeHours
            : c.value[locale],
    })),
  ];

  async function onSubmit() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await submitContactMessage({
        name: name.trim(),
        phone: phone.trim(),
        subject: subject.trim(),
        body: msg.trim(),
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : ERR[locale]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicPageShell>
      <section style={{ background: 'linear-gradient(150deg,#0d2640,#124a86)', color: '#fff', padding: '41px 22px 35px', textAlign: 'center' }}>
        <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 900, margin: '0 0 10px', letterSpacing: '-.5px' }}>{t.heroTitle}</h1>
        <p style={{ fontSize: 13, color: '#c9dcf3', margin: 0 }}>{t.heroDesc}</p>
      </section>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '31px 22px 55px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr', gap: 22, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {channels.map((c) => (
            <div key={c.title.fa} style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 15, padding: '16px 17px', display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: c.bg, color: c.color, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                {c.icon}
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0d2640' }}>{c.title[locale]}</div>
                <div data-testid={c.title.en === 'Email' ? 'contact-support-email' : c.title.en === '24-Hour Support Line' ? 'contact-support-phone' : undefined} style={{ fontSize: 12, color: '#5a6678', marginTop: 3 }} dir={c.ltr ? 'ltr' : undefined}>
                  {c.value}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 18, padding: '22px 24px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0d2640', margin: '0 0 6px' }}>{t.formHeading}</h2>
          <p style={{ fontSize: 12, color: '#8a96a6', margin: '0 0 16px', lineHeight: 1.8 }}>{t.formSub}</p>

          {sent ? (
            <div data-testid="contact-sent" style={{ background: '#eef9f1', border: '1px solid #bfe6cc', borderRadius: 12, padding: '22px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, color: '#1f8a5b', marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0d2640', marginBottom: 4 }}>{t.sentTitle}</div>
              <div style={{ fontSize: 11.5, color: '#5a6678' }}>{t.sentBody}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
                <input
                  data-testid="contact-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.namePlaceholder}
                  style={{ padding: '11px 13px', border: '1.5px solid #e3e9f1', borderRadius: 11, fontFamily: 'inherit', fontSize: 12.5, outline: 'none' }}
                />
                <input
                  data-testid="contact-phone"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t.phonePlaceholder}
                  style={{ padding: '11px 13px', border: '1.5px solid #e3e9f1', borderRadius: 11, fontFamily: 'inherit', fontSize: 12.5, outline: 'none' }}
                />
              </div>
              <input
                data-testid="contact-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t.subjectPlaceholder}
                style={{ padding: '11px 13px', border: '1.5px solid #e3e9f1', borderRadius: 11, fontFamily: 'inherit', fontSize: 12.5, outline: 'none' }}
              />
              <textarea
                data-testid="contact-msg"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder={t.msgPlaceholder}
                rows={5}
                style={{ padding: '11px 13px', border: '1.5px solid #e3e9f1', borderRadius: 11, fontFamily: 'inherit', fontSize: 12.5, outline: 'none', resize: 'vertical' }}
              />
              {error && <p style={{ margin: 0, fontSize: 11.5, color: '#d64545' }}>{error}</p>}
              <button
                type="button"
                data-testid="contact-submit"
                disabled={!canSubmit || submitting}
                onClick={() => void onSubmit()}
                style={{ alignSelf: 'flex-start', border: 'none', borderRadius: 11, background: canSubmit && !submitting ? '#1668c4' : '#aab8c8', color: '#fff', padding: '11px 26px', fontSize: 13, fontWeight: 800, cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
              >
                {t.sendLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </PublicPageShell>
  );
}
