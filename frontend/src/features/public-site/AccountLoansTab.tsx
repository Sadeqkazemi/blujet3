import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  createLoanApplication,
  fetchLoanProfile,
  fetchMyLoanApplications,
  startLoanAccountOpening,
  startLoanEligibility,
  syncLoanAccountOpening,
  syncLoanEligibility,
  syncMyLoanApplication,
} from "../../api/loans";
import MoneyInput from "../../components/MoneyInput";
import { useLocale, type StoredLocale } from "../../hooks/useLocale";
import { localeMoney, parseTomanToRialString } from "../../lib/fa-format";
import { tomanAmountInWords } from "../../lib/amount-in-words";
import { formatLocaleDateTime } from "../../lib/locale-format";
import type {
  LoanApplication,
  LoanCustomerProfile,
  LoanDisplayStatus,
} from "../../types/loans";

const COPY: Record<StoredLocale, Record<string, string>> = {
  fa: {
    title: "وام و اعتبار بانک سامان",
    subtitle:
      "افتتاح حساب، اعتبارسنجی و پرداخت وام مستقیماً از سرویس بانک پیگیری می‌شود.",
    step1: "اتصال به بانک سامان",
    step2: "درخواست وام و اعتبار",
    locked:
      "برای درخواست مبلغ، ابتدا اتصال به بانک و اعتبارسنجی را تکمیل کنید. تا مشخص‌شدن سقف ریالی اعتبار، این بخش غیرفعال است.",
    customer: "مشتری بانک سامان هستم",
    notCustomer: "مشتری بانک سامان نیستم",
    customerNo: "شماره مشتری بانک سامان",
    assess: "ارسال درخواست اعتبارسنجی",
    open: "ارسال درخواست افتتاح حساب",
    pendingOpening: "درخواست افتتاح حساب در بانک در حال بررسی است.",
    pendingEligibility:
      "اعتبارسنجی بانکی در حال انجام است؛ تا دریافت پاسخ، درخواست مبلغ غیرفعال می‌ماند.",
    refresh: "استعلام آخرین وضعیت",
    eligible: "سقف اعتبار تأییدشده بانک",
    amount: "مبلغ درخواستی (تومان)",
    submit: "درخواست وام و شارژ کیف پول",
    walletNote:
      "پس از تأیید و پرداخت بانک، مبلغ تأییدشده به‌صورت خودکار به کیف پول شما واریز می‌شود.",
    history: "سوابق درخواست‌ها",
    empty: "هنوز درخواست وامی ثبت نشده است.",
    validationCustomer: "شماره مشتری باید بین ۶ تا ۲۰ رقم باشد.",
    validationAmount: "مبلغ باید بیشتر از صفر و حداکثر برابر سقف اعتبار باشد.",
    loadError: "دریافت اطلاعات وام انجام نشد.",
    reference: "شناسه بانک",
    toman: "تومان",
    openingDone:
      "افتتاح حساب تکمیل شد. اکنون شماره مشتری را ثبت و اعتبارسنجی را آغاز کنید.",
    ineligible: "درخواست اعتبارسنجی توسط بانک تأیید نشد.",
    failed: "عملیات بانکی ناموفق بود؛ دوباره تلاش کنید.",
  },
  en: {
    title: "Saman Bank loan & credit",
    subtitle:
      "Account opening, assessment and disbursement are tracked directly through the bank service.",
    step1: "Saman Bank connection",
    step2: "Loan & credit request",
    locked:
      "Complete bank connection and assessment first. This section stays locked until the approved credit limit is returned.",
    customer: "I am a Saman Bank customer",
    notCustomer: "I am not a Saman Bank customer",
    customerNo: "Saman customer number",
    assess: "Start credit assessment",
    open: "Request account opening",
    pendingOpening: "Your bank account opening request is being reviewed.",
    pendingEligibility:
      "Credit assessment is in progress; amount request remains locked until the bank responds.",
    refresh: "Refresh bank status",
    eligible: "Bank-approved credit limit",
    amount: "Requested amount (Toman)",
    submit: "Request loan and fund wallet",
    walletNote:
      "After bank approval and disbursement, the approved amount is credited to your wallet automatically.",
    history: "Applications",
    empty: "No loan application yet.",
    validationCustomer: "Customer number must contain 6 to 20 digits.",
    validationAmount:
      "Amount must be positive and no greater than the approved limit.",
    loadError: "Could not load loan information.",
    reference: "Bank reference",
    toman: "Toman",
    openingDone:
      "Account opening is complete. Enter your customer number to start assessment.",
    ineligible: "The bank did not approve this credit assessment.",
    failed: "The bank operation failed; please try again.",
  },
  ar: {
    title: "قرض وائتمان بنك سامان",
    subtitle: "تتم متابعة فتح الحساب والتقييم والصرف مباشرة عبر خدمة البنك.",
    step1: "الاتصال ببنك سامان",
    step2: "طلب القرض والائتمان",
    locked:
      "أكمل الاتصال بالبنك والتقييم أولاً. يبقى هذا القسم مقفلاً حتى ظهور حد الائتمان المعتمد.",
    customer: "أنا عميل بنك سامان",
    notCustomer: "لست عميلاً لبنك سامان",
    customerNo: "رقم عميل بنك سامان",
    assess: "بدء التقييم الائتماني",
    open: "طلب فتح حساب",
    pendingOpening: "طلب فتح الحساب قيد مراجعة البنك.",
    pendingEligibility:
      "التقييم الائتماني جارٍ؛ يبقى طلب المبلغ مقفلاً حتى رد البنك.",
    refresh: "تحديث حالة البنك",
    eligible: "حد الائتمان المعتمد",
    amount: "المبلغ المطلوب (تومان)",
    submit: "طلب القرض وشحن المحفظة",
    walletNote:
      "بعد موافقة البنك والصرف، يُضاف المبلغ المعتمد تلقائياً إلى محفظتك.",
    history: "الطلبات السابقة",
    empty: "لا يوجد طلب قرض بعد.",
    validationCustomer: "يجب أن يتكون رقم العميل من ٦ إلى ٢٠ رقماً.",
    validationAmount: "يجب أن يكون المبلغ موجباً ولا يتجاوز الحد المعتمد.",
    loadError: "تعذر تحميل معلومات القرض.",
    reference: "مرجع البنك",
    toman: "تومان",
    openingDone: "اكتمل فتح الحساب. أدخل رقم العميل لبدء التقييم.",
    ineligible: "لم يوافق البنك على التقييم الائتماني.",
    failed: "فشلت العملية البنكية؛ حاول مرة أخرى.",
  },
};

const STATUS: Record<LoanDisplayStatus, Record<StoredLocale, string>> = {
  processing: { fa: "در حال ارسال", en: "Processing", ar: "قيد الإرسال" },
  awaiting_bank: {
    fa: "در انتظار بانک",
    en: "Awaiting bank",
    ar: "بانتظار البنك",
  },
  under_review: {
    fa: "در حال بررسی بانک",
    en: "Under review",
    ar: "قيد المراجعة",
  },
  approved: { fa: "تأیید بانک", en: "Approved", ar: "مقبول" },
  rejected: { fa: "رد بانک", en: "Rejected", ar: "مرفوض" },
  disbursed: {
    fa: "پرداخت و شارژ کیف پول",
    en: "Disbursed to wallet",
    ar: "تم الصرف للمحفظة",
  },
  cancelled: { fa: "لغوشده", en: "Cancelled", ar: "ملغي" },
  failed: { fa: "ناموفق", en: "Failed", ar: "فشل" },
  unknown: { fa: "نامشخص", en: "Unknown", ar: "غير معروف" },
};

export default function AccountLoansTab() {
  const { locale } = useLocale();
  const t = COPY[locale];
  const [profile, setProfile] = useState<LoanCustomerProfile | null>(null);
  const [items, setItems] = useState<LoanApplication[] | null>(null);
  const [isCustomer, setIsCustomer] = useState<boolean | null>(null);
  const [customerNumber, setCustomerNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextProfile, list] = await Promise.all([
        fetchLoanProfile(),
        fetchMyLoanApplications(),
      ]);
      setProfile(nextProfile);
      setItems(list.items);
      if (
        nextProfile.membershipStatus === "BANK_CUSTOMER" ||
        nextProfile.membershipStatus === "ACCOUNT_OPENED"
      )
        setIsCustomer(true);
      else if (nextProfile.membershipStatus === "ACCOUNT_OPENING_REQUESTED")
        setIsCustomer(false);
    } catch {
      setError(t.loadError);
    }
  }, [t.loadError]);
  useEffect(() => {
    void load();
  }, [load]);

  const eligibilityPending =
    profile?.eligibilityStatus === "SUBMITTED" ||
    profile?.eligibilityStatus === "UNDER_REVIEW";
  const openingPending =
    profile?.accountOpeningStatus === "SUBMITTED" ||
    profile?.accountOpeningStatus === "UNDER_REVIEW";
  const eligibleLimit =
    profile?.eligibilityStatus === "ELIGIBLE" && profile.eligibleAmountIrr
      ? BigInt(profile.eligibleAmountIrr)
      : null;
  const amountIrr = useMemo(() => {
    try {
      return parseTomanToRialString(amount);
    } catch {
      return null;
    }
  }, [amount]);
  const validAmount = Boolean(
    amountIrr &&
    BigInt(amountIrr) > 0n &&
    eligibleLimit &&
    BigInt(amountIrr) <= eligibleLimit,
  );
  const flowStatus = eligibilityPending
    ? locale === "fa"
      ? "اعتبارسنجی در حال انجام"
      : locale === "ar"
        ? "التقييم جارٍ"
        : "Assessment in progress"
    : profile?.eligibilityStatus === "ELIGIBLE"
      ? locale === "fa"
        ? "سقف اعتبار مشخص شد"
        : locale === "ar"
          ? "تم تحديد حد الائتمان"
          : "Credit limit available"
      : openingPending
        ? locale === "fa"
          ? "افتتاح حساب در حال بررسی"
          : locale === "ar"
            ? "فتح الحساب قيد المراجعة"
            : "Account opening in progress"
        : locale === "fa"
          ? "درخواستی ثبت نشده"
          : locale === "ar"
            ? "لا يوجد طلب"
            : "No request yet";

  async function run(action: () => Promise<LoanCustomerProfile>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await action();
      setProfile(next);
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.loadError);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function beginEligibility() {
    const normalized = customerNumber.replace(/\D/g, "");
    if (!/^\d{6,20}$/.test(normalized)) {
      setError(t.validationCustomer);
      return;
    }
    const next = await run(() =>
      startLoanEligibility(normalized, crypto.randomUUID()),
    );
    if (next) {
      setNotice(
        locale === "en"
          ? "Your credit assessment request was sent."
          : locale === "ar"
            ? "تم إرسال طلب التقييم الائتماني الخاص بك."
            : "درخواست اعتبارسنجی شما ارسال شد.",
      );
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!amountIrr || !validAmount) {
      setError(t.validationAmount);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createLoanApplication(amountIrr, crypto.randomUUID());
      setAmount("");
      setItems((await fetchMyLoanApplications()).items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.loadError);
    } finally {
      setBusy(false);
    }
  }

  async function syncApplication(row: LoanApplication) {
    setSyncingId(row.id);
    setError(null);
    try {
      const updated = await syncMyLoanApplication(row.id);
      setItems(
        (current) =>
          current?.map((item) => (item.id === updated.id ? updated : item)) ??
          [],
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.loadError);
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5" data-testid="account-loans-tab">
      <section className="rounded-2xl border border-[#e8eef6] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-[#0d2640]">{t.title}</h2>
            <p className="mt-2 text-xs leading-6 text-[#6b7787]">{t.subtitle}</p>
          </div>
          <span
            data-testid="loan-flow-status"
            className={`rounded-full px-3 py-1.5 text-[10px] font-black ${eligibleLimit ? "bg-emerald-50 text-emerald-700" : eligibilityPending || openingPending ? "bg-amber-50 text-amber-700" : "bg-[#f4f6f9] text-[#7b8797]"}`}
          >
            {flowStatus}
          </span>
        </div>
        <div className="mt-5 rounded-xl border border-[#e8eef6] p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#1668c4] text-xs font-black text-white">
              {locale === "fa" ? "۱" : locale === "ar" ? "١" : "1"}
            </span>
            <h3 className="text-sm font-black text-[#0d2640]">{t.step1}</h3>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              data-testid="loan-bank-customer"
              onClick={() => setIsCustomer(true)}
              disabled={busy || openingPending}
              className={`rounded-xl border p-3 text-xs font-black ${isCustomer === true ? "border-[#1668c4] bg-[#eaf2fc] text-[#1668c4]" : "border-[#e3e9f1] text-[#52657a]"} disabled:opacity-50`}
            >
              {t.customer}
            </button>
            <button
              type="button"
              data-testid="loan-bank-non-customer"
              onClick={() => setIsCustomer(false)}
              disabled={busy || eligibilityPending}
              className={`rounded-xl border p-3 text-xs font-black ${isCustomer === false ? "border-[#1668c4] bg-[#eaf2fc] text-[#1668c4]" : "border-[#e3e9f1] text-[#52657a]"} disabled:opacity-50`}
            >
              {t.notCustomer}
            </button>
          </div>
          {isCustomer === false && (
            <div className="mt-4">
              {openingPending ? (
                <PendingBox
                  text={t.pendingOpening}
                  button={t.refresh}
                  busy={busy}
                  testId="loan-sync-opening"
                  onClick={() => void run(syncLoanAccountOpening)}
                />
              ) : profile?.accountOpeningStatus === "COMPLETED" ? (
                <p className="rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700">
                  {t.openingDone}
                </p>
              ) : (
                <button
                  type="button"
                  data-testid="loan-open-account"
                  disabled={busy}
                  onClick={() =>
                    void run(() => startLoanAccountOpening(crypto.randomUUID()))
                  }
                  className="w-full rounded-xl bg-[#1668c4] p-3 text-xs font-black text-white disabled:opacity-50"
                >
                  {t.open}
                </button>
              )}
            </div>
          )}
          {(isCustomer === true ||
            profile?.accountOpeningStatus === "COMPLETED") &&
            profile?.eligibilityStatus !== "ELIGIBLE" &&
            !eligibilityPending && (
              <div
                className="mt-4 flex min-h-24 flex-col gap-3 rounded-2xl border border-[#dce5ef] bg-[#f8fbff] p-4"
                data-testid="loan-customer-number-field"
              >
                <label
                  htmlFor="loan-customer-number"
                  className="flex items-center gap-2 text-xs font-black text-[#31465f]"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-[#1668c4] shadow-sm" aria-hidden="true">
                    #
                  </span>
                  {t.customerNo}
                </label>
                <input
                  id="loan-customer-number"
                  data-testid="loan-customer-number"
                  inputMode="numeric"
                  value={customerNumber}
                  onChange={(event) =>
                    setCustomerNumber(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder={locale === "fa" ? "شماره مشتری را وارد کنید" : t.customerNo}
                  disabled={busy}
                  className="h-14 flex-1 rounded-xl border border-[#c9d8e8] bg-white px-4 text-sm font-bold outline-none transition focus:border-[#1668c4] focus:ring-2 focus:ring-[#d9eaff] disabled:bg-slate-50"
                />
                <button
                  type="button"
                  data-testid="loan-start-eligibility"
                  disabled={busy || customerNumber.length < 6}
                  onClick={() => void beginEligibility()}
                  className="h-12 w-full rounded-xl bg-[#1668c4] px-5 text-xs font-black text-white shadow-sm disabled:opacity-40"
                >
                  {t.assess}
                </button>
              </div>
            )}
          {notice && (
            <p
              role="status"
              data-testid="loan-request-notice"
              className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700"
            >
              ✓ {notice}
            </p>
          )}
          {eligibilityPending && (
            <div className="mt-4">
              <PendingBox
                text={t.pendingEligibility}
                button={t.refresh}
                busy={busy}
                testId="loan-sync-pending"
                onClick={() => void run(syncLoanEligibility)}
              />
            </div>
          )}
          {profile?.eligibilityStatus === "INELIGIBLE" && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">
              {t.ineligible}
            </p>
          )}
          {(profile?.eligibilityStatus === "FAILED" ||
            profile?.accountOpeningStatus === "FAILED") && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">
              {t.failed}
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <span
            className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${eligibleLimit ? "bg-[#1668c4] text-white" : "bg-[#dce4ee] text-[#8a96a6]"}`}
          >
            {locale === "fa" ? "۲" : locale === "ar" ? "٢" : "2"}
          </span>
          <h3 className={`text-sm font-black ${eligibleLimit ? "text-[#0d2640]" : "text-[#8a96a6]"}`}>
            {t.step2}
          </h3>
        </div>
        <form
          onSubmit={submit}
          className={`mt-3 rounded-xl border p-4 ${eligibleLimit ? "border-emerald-200 bg-emerald-50/30" : "border-[#e8eef6] bg-[#f8fafc]"}`}
          aria-disabled={!eligibleLimit}
        >
          {!eligibleLimit && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#e4e9f0] bg-[#f5f7fa] p-3 text-[11px] leading-6 text-[#7d8998]">
              <span aria-hidden="true">ⓘ</span>
              <span>{t.locked}</span>
            </div>
          )}
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-black text-[#3f546b]">
              {t.eligible}
            </span>
            <strong
              data-testid="loan-eligible-amount"
              className="font-num text-base text-emerald-700"
            >
              {eligibleLimit
                ? `${localeMoney(eligibleLimit.toString(), locale)} ${t.toman}`
                : "—"}
            </strong>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs font-bold text-[#3f546b]">
              {t.amount}
              <MoneyInput
                id="loan-amount-input"
                testId="loan-amount-input"
                theme="light"
                locale={locale}
                valueToman={amount}
                onChangeToman={setAmount}
                placeholder={locale === "fa" ? "۰" : "0"}
                className="mt-2"
                disabled={!eligibleLimit || busy}
              />
              {tomanAmountInWords(amount, locale) && (
                <div
                  data-testid="loan-amount-words"
                  className="mt-2 text-[11.5px] font-semibold leading-6 text-[#8a96a6]"
                >
                  {tomanAmountInWords(amount, locale)}
                </div>
              )}
            </label>
            <button
              data-testid="loan-submit"
              disabled={busy || !validAmount}
              className="h-12 rounded-xl bg-[#1668c4] px-6 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "…" : t.submit}
            </button>
          </div>
          {eligibleLimit && (
            <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-[10.5px] leading-5 text-[#5f746d]">
              {t.walletNote}
            </p>
          )}
        </form>
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-600"
          >
            {error}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[#e8eef6] bg-white p-5">
        <h3 className="mb-4 text-sm font-black text-[#0d2640]">{t.history}</h3>
        {items === null ? (
          <p className="text-center text-xs text-[#8a96a6]">…</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-xs text-[#8a96a6]">{t.empty}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((row) => (
              <article
                key={row.id}
                className="rounded-xl border border-[#edf1f6] bg-[#fafbfd] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-num text-base font-black text-[#1668c4]">
                      {localeMoney(row.requestedAmountIrr, locale)}{" "}
                      <small>{t.toman}</small>
                    </div>
                    <div className="mt-1 text-[11px] text-[#8a96a6]">
                      {formatLocaleDateTime(row.createdAt, locale)}
                    </div>
                    {row.bankReferenceId && (
                      <div className="mt-1 text-[11px] text-[#6b7787]">
                        {t.reference}:{" "}
                        <span dir="ltr" className="font-num">
                          {row.bankReferenceId}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="rounded-full bg-[#eaf2fc] px-3 py-1 text-[11px] font-black text-[#1668c4]">
                    {STATUS[row.displayStatus]?.[locale] ?? row.displayStatus}
                  </span>
                </div>
                {row.bankReferenceId &&
                  !["disbursed", "rejected", "cancelled"].includes(
                    row.displayStatus,
                  ) && (
                    <button
                      type="button"
                      onClick={() => void syncApplication(row)}
                      disabled={syncingId === row.id}
                      className="mt-3 text-xs font-black text-[#1668c4] disabled:opacity-50"
                    >
                      {syncingId === row.id ? "…" : t.refresh}
                    </button>
                  )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PendingBox({
  text,
  button,
  busy,
  testId,
  onClick,
}: {
  text: string;
  button: string;
  busy: boolean;
  testId: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-bold leading-6 text-amber-800">{text}</p>
      <button
        type="button"
        data-testid={testId}
        disabled={busy}
        onClick={onClick}
        className="mt-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-xs font-black text-amber-800 disabled:opacity-50"
      >
        {busy ? "…" : button}
      </button>
    </div>
  );
}
