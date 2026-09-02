import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchApiKeys, fetchAgencyPortalWebservicePlans, fetchMyWebserviceRequests, requestWebservice } from '../../api/agency-portal';
import { ApiRequestError } from '../../api/envelope';
import { formatLocaleDate } from '../../lib/locale-format';
import { localeMoney } from '../../lib/fa-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import type { AgencyApiKeySummary, AgencyApiScope, AgencyWebserviceRequest } from '../../types/agency-portal';

// وب‌سرویس (B2B API) — پلن انتخاب می‌شود، درخواست برای ادمین/مدیران ارسال
// می‌شود، و پس از تأیید کلید API واقعی صادر و از طریق مکاتبه (کارتابل) یک‌بار
// برای آژانس ارسال می‌شود (AgencyApiKey فقط هش کلید را نگه می‌دارد، هرگز کلید
// خام را — نمی‌توان آن را دوباره در این صفحه نمایش داد).
//
// wsInfoBanner/wsPendingTitle/wsPendingBadge/wsNewPurchaseTitle/
// wsNewPurchaseSub/wsTypeLabel/wsDurationLabel/wsPayableLabel/
// wsSubmitLabel/wsActiveTitle/wsActiveBadge/wsBaseUrlLabel2 reuse
// design-reference-v2/پنل آژانس.dc.html's own isEN vocabulary for this
// tab; the real scope names (SEARCH_BOOK/FULL/SEARCH_ONLY), 1/3/12-month
// plans, and the access-key-sent-via-correspondence wording don't have a
// design counterpart (the mock uses different sample scopes/durations
// and shows the raw key), so those and AR are hand-translated.

interface Tr {
  fa: string;
  en: string;
  ar: string;
}

const WS_TYPES: AgencyApiScope[] = ['SEARCH_BOOK', 'FULL'];

const SCOPE_LABEL: Record<string, Tr> = {
  SEARCH_BOOK: { fa: 'جستجو و رزرو', en: 'Search & Booking', ar: 'البحث والحجز' },
  FULL: { fa: 'فروش کامل (صدور بلیط)', en: 'Full Sale (Ticket Issuance)', ar: 'البيع الكامل (إصدار التذاكر)' },
  SEARCH_ONLY: { fa: 'فقط جستجو', en: 'Search Only', ar: 'البحث فقط' },
};

const WS_PLAN_LABELS: Record<1 | 3 | 12, Tr> = {
  1: { fa: '۱ ماهه', en: '1 Month', ar: 'شهر واحد' },
  3: { fa: '۳ ماهه', en: '3 Months', ar: '٣ أشهر' },
  12: { fa: '۱۲ ماهه', en: '12 Months', ar: '١٢ شهرًا' },
};

const STR: Record<StoredLocale, {
  toman: string;
  infoBanner: string;
  errorFallback: string;
  submitErrorFallback: string;
  loading: string;
  pendingTitle: string;
  pendingSub: string;
  pendingBadge: string;
  newPurchaseTitle: string;
  newPurchaseSub: string;
  rejectedNotice: string;
  typeLabel: string;
  durationLabel: string;
  payableLabel: string;
  submitLabel: string;
  submittingLabel: string;
  activeTitle: string;
  activeBadge: string;
  baseUrlLabel: string;
  domainLabel: string;
  keyNotice: string;
  activatedAtLabel: string;
  viewDocsLabel: string;
}> = {
  fa: {
    toman: 'تومان',
    infoBanner:
      'برای استفاده از وب‌سرویس ابتدا باید یک پلن را خریداری کنید؛ درخواست شما برای ادمین ارسال و پس از بررسی و تأیید، کلید دسترسی از طریق مکاتبه با آژانس ارسال می‌شود.',
    errorFallback: 'خطا در دریافت اطلاعات وب‌سرویس.',
    submitErrorFallback: 'خطا در ثبت درخواست.',
    loading: 'در حال بارگذاری…',
    pendingTitle: 'درخواست خرید شما در حال بررسی است',
    pendingSub: 'پس از تأیید توسط ادمین و مدیران مربوطه، وب‌سرویس فعال و کلید دسترسی از طریق مکاتبه ارسال می‌شود.',
    pendingBadge: 'در انتظار تأیید',
    newPurchaseTitle: 'خرید وب‌سرویس جدید',
    newPurchaseSub: 'پلن مورد نظر را انتخاب و خریداری کنید تا درخواست برای ادمین ارسال شود.',
    rejectedNotice: 'آخرین درخواست شما رد شد. می‌توانید درخواست جدیدی ثبت کنید.',
    typeLabel: 'نوع وب‌سرویس',
    durationLabel: 'مدت اشتراک',
    payableLabel: 'مبلغ قابل پرداخت',
    submitLabel: 'خرید و ثبت درخواست',
    submittingLabel: 'در حال ارسال…',
    activeTitle: 'اتصال فعال وب‌سرویس',
    activeBadge: '● فعال',
    baseUrlLabel: 'آدرس پایه (Base URL)',
    domainLabel: 'دامنه دسترسی',
    keyNotice:
      'کلید دسترسی API به دلیل امنیت فقط یک‌بار — هنگام تأیید درخواست — از طریق مکاتبه (کارتابل) برای شما ارسال شده است. در صورت گم‌شدن کلید، درخواست صدور مجدد را با پشتیبانی مطرح کنید.',
    activatedAtLabel: 'فعال‌سازی:',
    viewDocsLabel: 'مشاهده مستندات وب‌سرویس',
  },
  en: {
    toman: 'Toman',
    infoBanner:
      'To use the web service you must first purchase a plan; your request is sent to the admin, and once reviewed and approved, the access key is sent to your agency via correspondence.',
    errorFallback: 'Error loading web service information.',
    submitErrorFallback: 'Error submitting the request.',
    loading: 'Loading…',
    pendingTitle: 'Your purchase request is under review',
    pendingSub: 'Once approved by the admin and relevant managers, the web service will be activated and the access key sent via correspondence.',
    pendingBadge: 'Awaiting approval',
    newPurchaseTitle: 'Purchase a new web service',
    newPurchaseSub: 'Choose and purchase a plan to send the request to the admin.',
    rejectedNotice: 'Your last request was rejected. You can submit a new request.',
    typeLabel: 'Web service type',
    durationLabel: 'Subscription duration',
    payableLabel: 'Payable amount',
    submitLabel: 'Purchase & submit request',
    submittingLabel: 'Submitting…',
    activeTitle: 'Active web service connection',
    activeBadge: '● Active',
    baseUrlLabel: 'Base URL',
    domainLabel: 'Access scope',
    keyNotice:
      'For security, the API access key was sent to you only once — via correspondence (cartable) — when the request was approved. If you lose the key, request re-issuance through support.',
    activatedAtLabel: 'Activated:',
    viewDocsLabel: 'View web service documentation',
  },
  ar: {
    toman: 'تومان',
    infoBanner:
      'لاستخدام الخدمة الإلكترونية يجب أولاً شراء باقة؛ يُرسل طلبك إلى المدير، وبعد المراجعة والموافقة، تُرسل مفتاح الوصول إلى وكالتك عبر المراسلات.',
    errorFallback: 'خطأ في تحميل معلومات الخدمة الإلكترونية.',
    submitErrorFallback: 'خطأ في تسجيل الطلب.',
    loading: 'جارٍ التحميل…',
    pendingTitle: 'طلب الشراء الخاص بك قيد المراجعة',
    pendingSub: 'بعد موافقة المدير والمديرين المعنيين، سيتم تفعيل الخدمة الإلكترونية وإرسال مفتاح الوصول عبر المراسلات.',
    pendingBadge: 'بانتظار الموافقة',
    newPurchaseTitle: 'شراء خدمة إلكترونية جديدة',
    newPurchaseSub: 'اختر الباقة المطلوبة واشترها لإرسال الطلب إلى المدير.',
    rejectedNotice: 'تم رفض آخر طلب لك. يمكنك تسجيل طلب جديد.',
    typeLabel: 'نوع الخدمة الإلكترونية',
    durationLabel: 'مدة الاشتراك',
    payableLabel: 'المبلغ المستحق',
    submitLabel: 'الشراء وتسجيل الطلب',
    submittingLabel: 'جارٍ الإرسال…',
    activeTitle: 'اتصال الخدمة الإلكترونية النشط',
    activeBadge: '● نشط',
    baseUrlLabel: 'عنوان القاعدة (Base URL)',
    domainLabel: 'نطاق الوصول',
    keyNotice:
      'لأسباب أمنية، أُرسل مفتاح الوصول إلى API لمرة واحدة فقط — عند الموافقة على الطلب — عبر المراسلات (الكارتابل). في حال فقدان المفتاح، يُرجى طلب إعادة الإصدار من الدعم.',
    activatedAtLabel: 'التفعيل:',
    viewDocsLabel: 'عرض توثيق خدمة الويب',
  },
};

export default function AgencyWebservicePage() {
  const { locale } = useLocale();
  const t = STR[locale];
  const [wsType, setWsType] = useState<AgencyApiScope>('SEARCH_BOOK');
  const [plan, setPlan] = useState<1 | 3 | 12>(1);
  const [requests, setRequests] = useState<AgencyWebserviceRequest[]>([]);
  const [apiKeys, setApiKeys] = useState<AgencyApiKeySummary[]>([]);
  const [planPrices, setPlanPrices] = useState<Record<1 | 3 | 12, number>>({
    1: 45_000_000,
    3: 120_000_000,
    12: 420_000_000,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState('');

  const wsPlans = ([1, 3, 12] as const).map((key) => ({
    key,
    label: WS_PLAN_LABELS[key],
    priceLabel: localeMoney(planPrices[key], locale),
  }));

  const selPlan = wsPlans.find((p) => p.key === plan)!;

  function reload() {
    setLoading(true);
    Promise.all([fetchMyWebserviceRequests(), fetchApiKeys(), fetchAgencyPortalWebservicePlans()])
      .then(([r, k, plans]) => {
        setRequests(r);
        setApiKeys(k);
        const byMonth = Object.fromEntries(plans.plans.map((p) => [p.months, p.priceIrr])) as Record<
          1 | 3 | 12,
          number
        >;
        setPlanPrices(byMonth);
        setError(null);
      })
      .catch(() => setError(t.errorFallback))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, []);

  async function onBuy() {
    setSubmitting(true);
    setError(null);
    try {
      const requestNote = note.trim();
      if (requestNote) await requestWebservice(wsType, plan, requestNote);
      else await requestWebservice(wsType, plan);
      setNote('');
      reload();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.submitErrorFallback);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="p-8 text-sm text-muted">{t.loading}</p>;

  const activeKey = apiKeys.find((k) => k.status === 'ACTIVE');
  const pendingRequest = requests.find((r) => r.status === 'PENDING');
  const lastDecided = requests.find((r) => r.status !== 'PENDING');

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-[#d6e4f8] bg-[#f2f7fd] p-4 text-xs leading-6 text-[#3f546b]">
        {t.infoBanner}
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      {pendingRequest ? (
        <div data-testid="ws-pending" className="rounded-2xl border border-[#fde3c4] bg-[#fff7ed] p-6 text-center">
          <div className="mb-2 text-2xl">⏳</div>
          <div className="mb-1 text-sm font-black text-[#0d2640]">{t.pendingTitle}</div>
          <p className="text-xs leading-6 text-[#8a6a3a]">{t.pendingSub}</p>
          <span className="mt-3 inline-block rounded-full bg-[#fde3c4] px-3 py-1 text-[10.5px] font-extrabold text-[#9a5b16]">
            {t.pendingBadge}
          </span>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#e8eef6] bg-white p-5 shadow-sm">
          <div className="mb-1 text-sm font-black text-[#0d2640]">{t.newPurchaseTitle}</div>
          <p className="mb-4 text-[11.5px] text-[#8a96a6]">{t.newPurchaseSub}</p>

          {lastDecided?.status === 'REJECTED' && (
            <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{t.rejectedNotice}</div>
          )}

          <div className="mb-2 text-xs font-bold text-[#5a6678]">{t.typeLabel}</div>
          <div className="mb-4 flex gap-2">
            {WS_TYPES.map((s) => (
              <span
                key={s}
                data-testid={`ws-type-${s}`}
                onClick={() => setWsType(s)}
                className={`cursor-pointer rounded-lg px-4 py-2 text-xs font-bold ${wsType === s ? 'bg-[#1668c4] text-white' : 'bg-[#f1f4f8] text-[#5a6678]'}`}
              >
                {SCOPE_LABEL[s][locale]}
              </span>
            ))}
          </div>

          <div className="mb-2 text-xs font-bold text-[#5a6678]">{t.durationLabel}</div>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {wsPlans.map((p) => (
              <div
                key={p.key}
                data-testid={`ws-plan-${p.key}`}
                onClick={() => setPlan(p.key)}
                className={`cursor-pointer rounded-xl border p-3 text-center ${plan === p.key ? 'border-[#1668c4] bg-[#f2f7fd]' : 'border-[#e8eef6]'}`}
              >
                <div className="text-xs font-extrabold text-[#0d2640]">{p.label[locale]}</div>
                <div className="mt-1 text-[11px] font-bold text-[#1668c4]">
                  {p.priceLabel} {t.toman}
                </div>
              </div>
            ))}
          </div>

          <label className="mb-5 block text-xs font-bold text-[#5a6678]">
            {locale === 'fa' ? 'توضیحات درخواست' : locale === 'ar' ? 'تفاصيل الطلب' : 'Request details'}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={locale === 'fa' ? 'کاربرد مورد نظر و سامانه متصل‌شونده را توضیح دهید…' : locale === 'ar' ? 'اشرح الاستخدام والنظام المتصل…' : 'Describe the intended use and connected system…'}
              rows={3}
              className="mt-2 w-full rounded-xl border border-[#e8eef6] bg-[#fafbfd] p-3 text-sm font-normal outline-none focus:border-[#1668c4]"
            />
          </label>

          <div className="flex items-center justify-between rounded-xl bg-[#fafbfd] p-4">
            <div>
              <div className="text-[10.5px] text-[#8a96a6]">{t.payableLabel}</div>
              <div className="text-base font-black text-[#0d2640]">
                {selPlan.priceLabel} <span className="text-[10px] font-normal text-[#8a96a6]">{t.toman}</span>
              </div>
            </div>
            <button
              data-testid="ws-buy"
              disabled={submitting}
              onClick={() => void onBuy()}
              className="rounded-lg bg-[#1668c4] px-6 py-2.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {submitting ? t.submittingLabel : t.submitLabel}
            </button>
          </div>
        </div>
      )}

      {activeKey && (
        <div className="rounded-2xl border border-[#e8eef6] bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-black text-[#0d2640]">{t.activeTitle}</div>
            <span
              data-testid="ws-active-status"
              className="rounded-full bg-[#e8f5ee] px-3 py-1 text-[10.5px] font-extrabold text-[#1f8a5b]"
            >
              {t.activeBadge}
            </span>
          </div>
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-[#fafbfd] p-3">
              <div className="mb-1 text-[10.5px] text-[#8a96a6]">{t.baseUrlLabel}</div>
              <div className="font-num text-xs font-bold text-[#0d2640]" dir="ltr">
                https://api.blujet.ir/agency/v1
              </div>
            </div>
            <div className="rounded-xl bg-[#fafbfd] p-3">
              <div className="mb-1 text-[10.5px] text-[#8a96a6]">{t.domainLabel}</div>
              <div data-testid="ws-active-scope" className="text-xs font-bold text-[#0d2640]">
                {SCOPE_LABEL[activeKey.scope][locale]}
              </div>
            </div>
          </div>
          <div className="mb-3 rounded-xl border border-[#d6e4f8] bg-[#f2f7fd] p-3 text-[11px] leading-6 text-[#3f546b]">
            {t.keyNotice}
          </div>
          <div data-testid="ws-key-activated-at" className="text-[10.5px] text-[#8a96a6]">
            {t.activatedAtLabel} <span>{formatLocaleDate(activeKey.activatedAt, locale)}</span>
          </div>
          <Link
            to="/agency/apidocs"
            data-testid="ws-view-docs"
            className="mt-4 flex h-11 items-center justify-center gap-2 rounded-[10px] border border-[#d9e7f6] text-xs font-bold text-[#1668c4] transition hover:bg-[#f2f7fd]"
          >
            📄 {t.viewDocsLabel}
          </Link>
        </div>
      )}

      {requests.length > 0 && (
        <div className="rounded-2xl border border-[#e8eef6] bg-white shadow-sm">
          <h2 className="border-b border-[#edf0f5] px-5 py-4 text-sm font-black text-[#0d2640]">
            {locale === 'fa' ? 'درخواست‌های خرید من' : locale === 'ar' ? 'طلبات الشراء الخاصة بي' : 'My purchase requests'}
          </h2>
          <div>
            {requests.map((request) => {
              const status = request.status === 'PENDING'
                ? (locale === 'fa' ? 'در حال بررسی' : locale === 'ar' ? 'قيد المراجعة' : 'Under review')
                : request.status === 'APPROVED'
                  ? (locale === 'fa' ? 'تأییدشده' : locale === 'ar' ? 'مقبول' : 'Approved')
                  : (locale === 'fa' ? 'ردشده' : locale === 'ar' ? 'مرفوض' : 'Rejected');
              return (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f5] px-5 py-4 text-xs last:border-0">
                  <div>
                    <div className="font-black text-[#1a2d42]">{SCOPE_LABEL[request.scope][locale]}</div>
                    <div className="mt-1 text-[10px] text-muted">{request.months} · {formatLocaleDate(request.createdAt, locale)}</div>
                  </div>
                  <div className="font-black text-[#0d2640]">{localeMoney(request.priceIrr, locale)} {t.toman}</div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${request.status === 'PENDING' ? 'bg-[#fff1e5] text-[#c87322]' : request.status === 'APPROVED' ? 'bg-[#e9f7f0] text-[#23895f]' : 'bg-red-50 text-red-600'}`}>{status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
