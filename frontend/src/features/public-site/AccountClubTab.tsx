import { useState } from 'react';
import { Link } from 'react-router-dom';
import { joinClub, submitClubCardRequest } from '../../api/publicSite';
import { startLoanEligibility } from '../../api/loans';
import { ApiRequestError } from '../../api/envelope';
import { localeDigits } from '../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import type { ClubMembershipView } from '../../types/club-membership';

interface Tr {
  fa: string;
  en: string;
  ar: string;
}

const TIER_LABEL: Record<string, Tr> = {
  SILVER: { fa: 'نقره‌ای', en: 'Silver', ar: 'فضية' },
  GOLD: { fa: 'طلایی', en: 'Gold', ar: 'ذهبية' },
  PLATINUM: { fa: 'پلاتین', en: 'Platinum', ar: 'بلاتينية' },
};

const TIER_STYLE = {
  SILVER: {
    bannerBg: 'linear-gradient(135deg,#aab4c0,#717d8c)',
    main: '#8a96a6',
    border: '#dde2e8',
    soft: '#f4f6f8',
    text: '#4a5568',
    subtext: '#6b7787',
  },
  GOLD: {
    bannerBg: 'linear-gradient(135deg,#caa53a,#9a7d22)',
    main: '#caa53a',
    border: '#f0dfa8',
    soft: '#fdf8ea',
    text: '#8a6d1f',
    subtext: '#a1801f',
  },
  PLATINUM: {
    bannerBg: 'linear-gradient(135deg,#7c5cd6,#4f3596)',
    main: '#7c5cd6',
    border: '#dcd2f5',
    soft: '#f4f1fc',
    text: '#4f3596',
    subtext: '#6b52ad',
  },
} as const;

const CLUB_STR: Record<StoredLocale, {
  notMemberText: string;
  joinFreeBtn: string;
  lblYourTier: string;
  lblCurrentPoints: string;
  membershipShort: (tier: string) => string;
  tierProgress: (from: string, to: string, next: string) => { from: string; to: string; next: string };
  hdrClubCard: string;
  subClubCard: string;
  lblYourPoints: string;
  lblRequiredThreshold: string;
  cardIssuedLabel: string;
  btnDownloadCard: string;
  btnRequestCard: string;
  eligibleTitle: (tier: string) => string;
  eligibleSub: (points: string) => string;
  lockedTitle: (tier: string) => string;
  lockedSub: (needed: string) => string;
  cardStatus: Record<string, string>;
  stepLabels: Record<string, string>;
  hdrTierBenefits: string;
  bankTitle: string;
  bankSubtitle: string;
  bankStep: string;
  bankCustomer: string;
  bankNotCustomer: string;
  bankCustomerHint: string;
  bankNotCustomerHint: string;
  bankCustomerCta: string;
  bankNotCustomerCta: string;
  benefits: { title: string; desc: string }[];
  btnFullClubIntro: string;
  requestSuccess: string;
  requestErrorFallback: string;
  requestingBtn: string;
}> = {
  fa: {
    notMemberText: 'هنوز عضو باشگاه مشتریان نیستید.',
    joinFreeBtn: 'عضویت رایگان',
    lblYourTier: 'سطح عضویت شما',
    lblCurrentPoints: 'امتیاز فعلی',
    membershipShort: (tier) => `عضو ${tier}`,
    tierProgress: (from, to, next) => ({ from, to, next }),
    hdrClubCard: 'کارت عضویت باشگاه',
    subClubCard: 'با رسیدن به ۵٬۰۰۰ امتیاز واجد شرایط دریافت کارت می‌شوید؛ درخواست برای ادمین ارسال و پس از تأیید مدیران کارت صادر می‌شود.',
    lblYourPoints: 'امتیاز شما',
    lblRequiredThreshold: 'حد نصاب',
    cardIssuedLabel: 'کارت عضویت صادر شد',
    btnDownloadCard: 'دانلود کارت',
    btnRequestCard: 'درخواست صدور کارت عضویت',
    eligibleTitle: (tier) => `کارت ${tier} را دارید!`,
    eligibleSub: (points) => `با ${points} امتیاز، واجد شرایط دریافت کارت عضویت هستید.`,
    lockedTitle: (tier) => `کارت ${tier} — هنوز واجد شرایط نیستید`,
    lockedSub: (needed) => `${needed} امتیاز دیگر تا حد نصاب دریافت کارت.`,
    cardStatus: {
      NONE: 'درخواستی ثبت نشده',
      REVIEW: 'در حال بررسی',
      ISSUED: 'کارت صادر شده',
    },
    stepLabels: {
      submitted: 'ثبت درخواست صدور کارت',
      referred: 'ارجاع برای تأیید مدیران',
      approved: 'تأیید و صدور کارت',
      rejected: 'رد درخواست',
    },
    hdrTierBenefits: 'مزایای سطح عضویت',
    bankTitle: 'بلو بانک و وام باشگاه مشتریان',
    bankSubtitle: 'برای استفاده از وام باشگاه، وضعیت مشتری بانک را مشخص کنید و سپس از مسیر رسمی درخواست اقدام کنید.',
    bankStep: 'اتصال به بلو بانک',
    bankCustomer: 'مشتری بانک سامان هستم',
    bankNotCustomer: 'مشتری بانک سامان نیستم',
    bankCustomerHint: 'درخواست وام از صفحه وام و اعتبارات مستقیماً برای API بانک ارسال می‌شود.',
    bankNotCustomerHint: 'برای افتتاح حساب و صدور کارت، درخواست عضویت را برای پشتیبانی ارسال کنید.',
    bankCustomerCta: 'ورود به درخواست وام',
    bankNotCustomerCta: 'ارسال درخواست عضویت',
    benefits: [
      { title: 'ارتقای رایگان به بیزینس', desc: 'در پروازهای منتخب' },
      { title: 'تا ۵٪ کش‌بک بیشتر', desc: 'روی هر خرید بلیط' },
      { title: 'پذیرش اختصاصی فرودگاه', desc: 'بدون صف، سریع‌تر' },
      { title: '۲ برابر امتیاز', desc: 'در فصل‌های پرسفر' },
    ],
    btnFullClubIntro: 'معرفی کامل باشگاه مشتریان',
    requestSuccess: 'درخواست صدور کارت عضویت ثبت و برای ادمین ارسال شد ✓',
    requestErrorFallback: 'خطا در ثبت درخواست کارت.',
    requestingBtn: 'در حال ثبت…',
  },
  en: {
    notMemberText: "You're not a loyalty club member yet.",
    joinFreeBtn: 'Join Free',
    lblYourTier: 'Your Tier',
    lblCurrentPoints: 'Current Points',
    membershipShort: (tier) => `${tier} Member`,
    tierProgress: (from, to, next) => ({ from, to, next }),
    hdrClubCard: 'Loyalty Club Card',
    subClubCard: 'You qualify for a card at 5,000 points; your request is sent to the admin and issued once approved.',
    lblYourPoints: 'Your points',
    lblRequiredThreshold: 'Required threshold',
    cardIssuedLabel: 'Membership card issued',
    btnDownloadCard: 'Download Card',
    btnRequestCard: 'Request Membership Card',
    eligibleTitle: (tier) => `You're eligible for the ${tier} card!`,
    eligibleSub: (points) => `With ${points} points, you qualify for a membership card.`,
    lockedTitle: (tier) => `${tier} card — not yet eligible`,
    lockedSub: (needed) => `${needed} more points until the card threshold.`,
    cardStatus: {
      NONE: 'No request submitted',
      REVIEW: 'Under Review',
      ISSUED: 'Card Issued',
    },
    stepLabels: {
      submitted: 'Card request submitted',
      referred: 'Referred for manager approval',
      approved: 'Approved & card issued',
      rejected: 'Request rejected',
    },
    hdrTierBenefits: 'Tier Benefits',
    bankTitle: 'Blu Bank & Club Loans',
    bankSubtitle: 'Choose your bank-customer status, then continue through the official application flow.',
    bankStep: 'Connect to Blu Bank',
    bankCustomer: 'I am a Saman Bank customer',
    bankNotCustomer: 'I am not a Saman Bank customer',
    bankCustomerHint: 'Loan applications are sent directly to the bank API from the Loans & Credit page.',
    bankNotCustomerHint: 'Send a membership request to support for account opening and card issuance.',
    bankCustomerCta: 'Open loan application',
    bankNotCustomerCta: 'Send membership request',
    benefits: [
      { title: 'Free upgrade to Business', desc: 'On select flights' },
      { title: 'Up to 5% extra cashback', desc: 'On every ticket purchase' },
      { title: 'Priority airport check-in', desc: 'No lines, faster service' },
      { title: '2x points', desc: 'During peak travel seasons' },
    ],
    btnFullClubIntro: 'Full Club Introduction',
    requestSuccess: 'Your membership card request was submitted ✓',
    requestErrorFallback: 'Error submitting card request.',
    requestingBtn: 'Submitting…',
  },
  ar: {
    notMemberText: 'لست عضواً في نادي الولاء بعد.',
    joinFreeBtn: 'انضم مجاناً',
    lblYourTier: 'مستوى عضويتك',
    lblCurrentPoints: 'النقاط الحالية',
    membershipShort: (tier) => `عضو ${tier}`,
    tierProgress: (from, to, next) => ({ from, to, next }),
    hdrClubCard: 'بطاقة عضوية النادي',
    subClubCard: 'عند الوصول إلى 5000 نقطة تصبح مؤهلاً للبطاقة؛ يُرسل الطلب للإدارة ويُصدر بعد الموافقة.',
    lblYourPoints: 'نقاطك',
    lblRequiredThreshold: 'الحد الأدنى',
    cardIssuedLabel: 'تم إصدار بطاقة العضوية',
    btnDownloadCard: 'تنزيل البطاقة',
    btnRequestCard: 'طلب بطاقة العضوية',
    eligibleTitle: (tier) => `أنت مؤهل لبطاقة ${tier}!`,
    eligibleSub: (points) => `بـ ${points} نقطة، أنت مؤهل لبطاقة العضوية.`,
    lockedTitle: (tier) => `بطاقة ${tier} — غير مؤهل بعد`,
    lockedSub: (needed) => `${needed} نقطة أخرى حتى حد البطاقة.`,
    cardStatus: {
      NONE: 'لم يُقدَّم طلب',
      REVIEW: 'قيد المراجعة',
      ISSUED: 'تم إصدار البطاقة',
    },
    stepLabels: {
      submitted: 'تقديم طلب البطاقة',
      referred: 'إحالة للموافقة الإدارية',
      approved: 'تمت الموافقة وإصدار البطاقة',
      rejected: 'رفض الطلب',
    },
    hdrTierBenefits: 'مزايا المستوى',
    bankTitle: 'بلو بنك وقروض النادي',
    bankSubtitle: 'حدد حالة عميل البنك ثم تابع عبر مسار الطلب الرسمي.',
    bankStep: 'الاتصال ببلو بنك',
    bankCustomer: 'أنا عميل بنك سامان',
    bankNotCustomer: 'لست عميلاً في بنك سامان',
    bankCustomerHint: 'تُرسل طلبات القرض مباشرة إلى واجهة البنك من صفحة القروض والائتمان.',
    bankNotCustomerHint: 'أرسل طلب عضوية إلى الدعم لفتح الحساب وإصدار البطاقة.',
    bankCustomerCta: 'فتح طلب القرض',
    bankNotCustomerCta: 'إرسال طلب العضوية',
    benefits: [
      { title: 'ترقية مجانية إلى درجة الأعمال', desc: 'في رحلات مختارة' },
      { title: 'حتى 5٪ استرداد إضافي', desc: 'على كل شراء تذكرة' },
      { title: 'تسجيل وصول أولوية', desc: 'بدون طوابير' },
      { title: 'نقاط مضاعفة', desc: 'في مواسم السفر' },
    ],
    btnFullClubIntro: 'مقدمة كاملة عن النادي',
    requestSuccess: 'تم تقديم طلب بطاقة العضوية ✓',
    requestErrorFallback: 'خطأ في تقديم طلب البطاقة.',
    requestingBtn: 'جارٍ التقديم…',
  },
};

function tierProgressInfo(membership: ClubMembershipView, locale: StoredLocale) {
  const { level, balance, tierRules } = membership;
  const tierName = TIER_LABEL[level ?? 'SILVER']?.[locale] ?? level ?? '';
  const gMin = tierRules.goldMinPoints;
  const pMin = tierRules.platinumMinPoints;

  if (level === 'PLATINUM') {
    return {
      membershipShort: CLUB_STR[locale].membershipShort(tierName),
      from: TIER_LABEL.PLATINUM[locale],
      to: TIER_LABEL.PLATINUM[locale],
      next: locale === 'en' ? 'Highest club tier' : locale === 'ar' ? 'أعلى مستوى في النادي' : 'بالاترین سطح باشگاه',
      progressPct: 100,
      style: TIER_STYLE.PLATINUM,
    };
  }
  if (level === 'GOLD') {
    const remaining = Math.max(pMin - balance, 0);
    return {
      membershipShort: CLUB_STR[locale].membershipShort(tierName),
      from: TIER_LABEL.GOLD[locale],
      to: TIER_LABEL.PLATINUM[locale],
      next: locale === 'en'
        ? `To Platinum: ${localeDigits(remaining, locale)} more points`
        : locale === 'ar'
          ? `حتى البلاتين: ${localeDigits(remaining, locale)} نقطة أخرى`
          : `تا پلاتین: ${localeDigits(remaining, locale)} امتیاز دیگر`,
      progressPct: Math.min(100, Math.round((balance / pMin) * 100)),
      style: TIER_STYLE.GOLD,
    };
  }
  const remaining = Math.max(gMin - balance, 0);
  return {
    membershipShort: CLUB_STR[locale].membershipShort(tierName),
    from: TIER_LABEL.SILVER[locale],
    to: TIER_LABEL.GOLD[locale],
    next: locale === 'en'
      ? `To Gold: ${localeDigits(remaining, locale)} more points`
      : locale === 'ar'
        ? `حتى الذهبية: ${localeDigits(remaining, locale)} نقطة أخرى`
        : `تا طلایی: ${localeDigits(remaining, locale)} امتیاز دیگر`,
    progressPct: Math.min(100, Math.round((balance / gMin) * 100)),
    style: TIER_STYLE.SILVER,
  };
}

function cardStatusStyle(status: string | null) {
  if (status === 'ISSUED') return { color: '#1f8a5b', bg: 'rgba(31,138,91,.1)' };
  if (status === 'REVIEW') return { color: '#b5790f', bg: 'rgba(181,121,15,.1)' };
  return { color: '#5a6678', bg: '#f2f4f7' };
}

interface Props {
  membership: ClubMembershipView | null;
  onMembershipChange: (m: ClubMembershipView) => void;
}

export default function AccountClubTab({ membership, onMembershipChange }: Props) {
  const { locale } = useLocale();
  const t = CLUB_STR[locale];
  const [requestBusy, setRequestBusy] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [bankCustomer, setBankCustomer] = useState(true);
  const [bankCustomerNumber, setBankCustomerNumber] = useState('');
  const [bankRequestBusy, setBankRequestBusy] = useState(false);
  const [bankRequestError, setBankRequestError] = useState<string | null>(null);
  const [bankRequestSent, setBankRequestSent] = useState(false);

  async function onStartBankEligibility() {
    const customerNumber = bankCustomerNumber.replace(/\D/g, '');
    if (!/^\d{6,20}$/.test(customerNumber)) {
      setBankRequestError(
        locale === 'en'
          ? 'Enter a valid Saman customer number.'
          : locale === 'ar'
            ? 'أدخل رقم عميل سامان صحيحًا.'
            : 'شماره مشتری معتبر بانک سامان را وارد کنید.',
      );
      return;
    }
    setBankRequestBusy(true);
    setBankRequestError(null);
    setBankRequestSent(false);
    try {
      await startLoanEligibility(customerNumber, crypto.randomUUID());
      setBankRequestSent(true);
    } catch (err) {
      setBankRequestError(
        err instanceof ApiRequestError
          ? err.message
          : locale === 'en'
            ? 'The credit assessment request could not be sent.'
            : 'ارسال درخواست اعتبارسنجی انجام نشد.',
      );
    } finally {
      setBankRequestBusy(false);
    }
  }

  async function onJoinClub() {
    setJoinBusy(true);
    setJoinError(null);
    try {
      const next = await joinClub();
      onMembershipChange(next);
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

  if (!membership?.isMember) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e8eef6', borderRadius: 18, padding: '40px 26px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#6b7787', marginBottom: 14 }}>{t.notMemberText}</p>
        {joinError && (
          <p style={{ fontSize: 12.5, color: '#c0392b', marginBottom: 12 }}>{joinError}</p>
        )}
        <button
          type="button"
          data-testid="account-club-join"
          disabled={joinBusy}
          onClick={() => void onJoinClub()}
          style={{
            background: '#1668c4',
            color: '#fff',
            padding: '10px 24px',
            borderRadius: 11,
            fontSize: 12.5,
            fontWeight: 800,
            border: 'none',
            cursor: joinBusy ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            opacity: joinBusy ? 0.7 : 1,
          }}
        >
          {t.joinFreeBtn}
        </button>
      </div>
    );
  }

  const m = membership;
  const tierInfo = tierProgressInfo(m, locale);
  const tierStyle = tierInfo.style;
  const cardProgress = Math.min(
    100,
    Math.round((m.balance / m.tierRules.cardRequestMinPoints) * 100),
  );
  const cardIssued = m.cardStatus === 'ISSUED';
  const showTracker = !!m.cardRequest;
  const cardSt = cardStatusStyle(m.cardStatus);
  const eligibleTier = TIER_LABEL[m.level ?? 'GOLD']?.[locale] ?? m.level ?? '';

  async function onRequestCard() {
    setRequestBusy(true);
    setRequestError(null);
    setNotice(null);
    try {
      const req = await submitClubCardRequest();
      onMembershipChange({
        ...m,
        cardStatus: 'REVIEW',
        cardRequest: req,
        canRequestCard: false,
      });
      setNotice(t.requestSuccess);
    } catch (err) {
      setRequestError(err instanceof ApiRequestError ? err.message : t.requestErrorFallback);
    } finally {
      setRequestBusy(false);
    }
  }

  const historySteps = (membership.cardRequest?.history ?? []).map((step, i, arr) => ({
    ...step,
    label: t.stepLabels[step.step] ?? step.labelFa,
    done: i < arr.length,
    dotBg: '#1f8a5b',
    lineBg: i < arr.length - 1 ? '#bfe6cf' : 'transparent',
    textColor: '#0d2640',
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: tierInfo.style.bannerBg, color: '#fff', borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 13 }}>
          <div>
            <div style={{ fontSize: 11.5, opacity: 0.9 }}>{t.lblYourTier}</div>
            <div style={{ fontSize: 23.5, fontWeight: 900, marginTop: 4 }}>{tierInfo.membershipShort}</div>
          </div>
          <div style={{ textAlign: locale === 'en' ? 'right' : 'left' }}>
            <div style={{ fontSize: 11.5, opacity: 0.9 }}>{t.lblCurrentPoints}</div>
            <div style={{ fontSize: 23.5, fontWeight: 900, marginTop: 4 }}>{localeDigits(membership.balance, locale)}</div>
          </div>
        </div>
        <div style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, opacity: 0.95, marginBottom: 8 }}>
            <span>{tierInfo.from}</span>
            <span>{tierInfo.next}</span>
            <span>{tierInfo.to}</span>
          </div>
          <div style={{ height: 10, background: '#ffffff33', borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ width: `${tierInfo.progressPct}%`, height: '100%', background: '#fff', borderRadius: 18 }} />
          </div>
        </div>
      </div>

      <div data-testid="club-bank-loan-section" style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: 0 }}>{t.bankTitle}</h3>
            <p style={{ fontSize: 11.5, color: '#8a96a6', lineHeight: 1.9, margin: '5px 0 0' }}>{t.bankSubtitle}</p>
          </div>
          <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#1668c4', color: '#fff', fontSize: 12, fontWeight: 900 }}>۱</span>
        </div>
        <div style={{ marginTop: 16, fontSize: 13, fontWeight: 800, color: '#0d2640' }}>{t.bankStep}</div>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', borderRadius: 12, background: '#f3f5f8', padding: 4, gap: 4 }}>
          {[true, false].map((value) => (
            <button
              key={String(value)}
              type="button"
              data-testid={value ? 'club-bank-customer' : 'club-bank-non-customer'}
              onClick={() => {
                setBankCustomer(value);
                setBankRequestError(null);
                setBankRequestSent(false);
              }}
              style={{ minHeight: 44, border: bankCustomer === value ? '1px solid #e0e6ee' : '1px solid transparent', borderRadius: 10, background: bankCustomer === value ? '#fff' : 'transparent', color: bankCustomer === value ? '#0d2640' : '#8a96a6', boxShadow: bankCustomer === value ? '0 2px 8px rgba(13,38,64,.07)' : 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
            >
              {value ? t.bankCustomer : t.bankNotCustomer}
            </button>
          ))}
        </div>
        <p style={{ margin: '12px 0', color: '#718096', fontSize: 11.5, lineHeight: 1.9 }}>
          {bankCustomer ? t.bankCustomerHint : t.bankNotCustomerHint}
        </p>
        {bankCustomer && (
          <div style={{ border: '1px solid #d9e5f2', background: '#f8fbff', borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <label htmlFor="club-bank-customer-number" style={{ display: 'block', color: '#31465f', fontSize: 11.5, fontWeight: 800, marginBottom: 7 }}>
              {locale === 'en' ? 'Saman customer number' : locale === 'ar' ? 'رقم عميل بنك سامان' : 'شماره مشتری بانک سامان'}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <input
                id="club-bank-customer-number"
                data-testid="club-bank-customer-number"
                value={bankCustomerNumber}
                inputMode="numeric"
                disabled={bankRequestBusy || bankRequestSent}
                onChange={(event) => setBankCustomerNumber(event.target.value.replace(/\D/g, ''))}
                placeholder={locale === 'fa' ? 'شماره مشتری را وارد کنید' : 'Customer number'}
                style={{ minWidth: 0, flex: '1 1 230px', height: 50, border: '1px solid #cbd9e8', borderRadius: 11, background: '#fff', padding: '0 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                data-testid="club-bank-submit"
                disabled={bankRequestBusy || bankRequestSent || bankCustomerNumber.length < 6}
                onClick={() => void onStartBankEligibility()}
                style={{ minHeight: 50, flex: '1 1 190px', border: 'none', borderRadius: 11, background: '#1668c4', color: '#fff', padding: '0 18px', fontFamily: 'inherit', fontSize: 12, fontWeight: 900, cursor: bankRequestBusy ? 'wait' : 'pointer', opacity: bankRequestBusy || bankRequestSent || bankCustomerNumber.length < 6 ? 0.48 : 1 }}
              >
                {bankRequestBusy ? '…' : locale === 'fa' ? 'ارسال درخواست اعتبارسنجی' : locale === 'ar' ? 'إرسال طلب التقييم' : 'Request assessment'}
              </button>
            </div>
            {bankRequestError && <p role="alert" style={{ margin: '10px 0 0', color: '#c0392b', fontSize: 11.5, fontWeight: 700 }}>{bankRequestError}</p>}
            {bankRequestSent && (
              <p role="status" data-testid="club-bank-success" style={{ margin: '10px 0 0', color: '#1f8a5b', background: '#eaf8f1', borderRadius: 10, padding: '9px 11px', fontSize: 11.5, fontWeight: 800 }}>
                ✓ {locale === 'en' ? 'Your credit assessment request was sent.' : locale === 'ar' ? 'تم إرسال طلب التقييم الائتماني الخاص بك.' : 'درخواست اعتبارسنجی شما ارسال شد.'}
              </p>
            )}
          </div>
        )}
        <Link
          to={bankCustomer ? '/account?tab=loans' : '/account?tab=tickets'}
          data-testid="club-bank-action"
          style={{ display: 'flex', minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: '#1668c4', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 900 }}
        >
          {bankCustomer ? t.bankCustomerCta : t.bankNotCustomerCta}
        </Link>
      </div>

      <div style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: 0 }}>{t.hdrClubCard}</h3>
          <span style={{ fontSize: 11, fontWeight: 700, color: cardSt.color, background: cardSt.bg, padding: '5px 11px', borderRadius: 18 }}>
            {t.cardStatus[membership.cardStatus ?? 'NONE'] ?? membership.cardStatus}
          </span>
        </div>
        <p style={{ fontSize: 11.5, color: '#8a96a6', margin: '0 0 18px' }}>{t.subClubCard}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#5a6678', marginBottom: 8 }}>
          <span>{t.lblYourPoints}: <b style={{ color: '#0d2640' }}>{localeDigits(membership.balance, locale)}</b></span>
          <span>{t.lblRequiredThreshold}: {localeDigits(membership.tierRules.cardRequestMinPoints, locale)}</span>
        </div>
        <div style={{ height: 10, background: '#eef1f5', borderRadius: 18, overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ width: `${cardProgress}%`, height: '100%', background: tierStyle.main, borderRadius: 18 }} />
        </div>

        {cardIssued && membership.cardNo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'linear-gradient(135deg,#caa53a,#9a7d22)', color: '#fff', borderRadius: 14, padding: '15px 16px', marginBottom: 18 }}>
            <div style={{ fontSize: 27 }}>💳</div>
            <div style={{ lineHeight: 1.5 }}>
              <div style={{ fontSize: 11.5, opacity: 0.9 }}>{eligibleTier} — {t.cardIssuedLabel}</div>
              <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 1 }} dir="ltr">{membership.cardNo}</div>
            </div>
          </div>
        )}

        {showTracker && historySteps.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 18 }} data-testid="club-card-tracker">
            {historySteps.map((st, i) => (
              <div key={`${st.step}-${i}`} style={{ display: 'flex', gap: 11 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: st.dotBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>✓</span>
                  {i < historySteps.length - 1 && (
                    <span style={{ width: 2, flex: 1, minHeight: 16, background: st.lineBg }} />
                  )}
                </div>
                <div style={{ paddingBottom: 13 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: st.textColor }}>{st.label}</div>
                  <div style={{ fontSize: 10, color: '#9aa4b2', marginTop: 2 }}>{st.at}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {membership.canRequestCard && (
          <div style={{ border: `1.5px solid ${tierStyle.border}`, background: tierStyle.soft, borderRadius: 14, padding: '15px 15px 13px' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: tierStyle.text, marginBottom: 6 }}>
              {t.eligibleTitle(eligibleTier)}
            </div>
            <div style={{ fontSize: 11.5, color: tierStyle.subtext, marginBottom: 16 }}>
              {t.eligibleSub(localeDigits(membership.balance, locale))}
            </div>
            {requestError && <p role="alert" style={{ fontSize: 12, color: '#e5484d', marginBottom: 10 }}>{requestError}</p>}
            {notice && <p style={{ fontSize: 12, color: '#1f8a5b', marginBottom: 10 }}>{notice}</p>}
            <button
              type="button"
              data-testid="club-request-card-btn"
              disabled={requestBusy}
              onClick={() => void onRequestCard()}
              style={{ width: '100%', height: 50, borderRadius: 12, background: tierStyle.main, color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {requestBusy ? t.requestingBtn : t.btnRequestCard}
            </button>
          </div>
        )}

        {!membership.canRequestCard && !cardIssued && !showTracker && (
          <div style={{ border: `1.5px solid ${tierStyle.border}`, background: tierStyle.soft, borderRadius: 14, padding: '15px 15px 13px' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: tierStyle.text }}>{t.lockedTitle(eligibleTier)}</div>
            <div style={{ fontSize: 11.5, color: tierStyle.subtext, marginTop: 3 }}>
              {t.lockedSub(localeDigits(membership.pointsNeededForCard, locale))}
            </div>
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}>
        <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: '0 0 18px' }}>{t.hdrTierBenefits}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 11 }}>
          {t.benefits.map((b) => (
            <div key={b.title} style={{ display: 'flex', alignItems: 'center', gap: 11, border: '1px solid #eef1f5', borderRadius: 13, padding: 11 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff7e6', color: '#caa53a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>★</div>
              <div style={{ lineHeight: 1.5 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{b.title}</div>
                <div style={{ fontSize: 11.5, color: '#9aa4b2' }}>{b.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <Link
          to="/club"
          style={{ textDecoration: 'none', display: 'flex', marginTop: 20, height: 50, borderRadius: 12, background: '#1668c4', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 800 }}
        >
          {t.btnFullClubIntro}
        </Link>
      </div>
    </div>
  );
}
