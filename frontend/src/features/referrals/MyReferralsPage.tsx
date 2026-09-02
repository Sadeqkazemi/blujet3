import { useCallback, useEffect, useState } from 'react';
import {
  fetchMyReferrals,
  sendEmployeeManagerMessage,
  submitReferralReport,
} from '../../api/cartable';
import EmployeeUnitPill from '../../components/EmployeeUnitPill';
import AttachmentPicker from '../../components/AttachmentPicker';
import AttachmentList from '../../components/AttachmentList';
import { formatJalaliDateTime } from '../../lib/jalali';
import type {
  MyReferral,
  MyReferralListResult,
  ReferralAttachment,
  ReferralStatus,
} from '../../types/cartable';

const STATUS_META: Record<ReferralStatus, { label: string; className: string }> = {
  SENT: {
    label: 'در انتظار اقدام',
    className: 'bg-[rgba(245,158,11,.14)] text-[#f59e0b] border-[rgba(245,158,11,.28)]',
  },
  REVIEWING: {
    label: 'در حال بررسی',
    className: 'bg-[rgba(59,130,246,.14)] text-[#60a5fa] border-[rgba(59,130,246,.28)]',
  },
  REPORTED: {
    label: 'گزارش ارسال‌شده',
    className: 'bg-[rgba(52,211,153,.14)] text-[#34d399] border-[rgba(52,211,153,.28)]',
  },
  CLOSED: {
    label: 'تکمیل‌شده',
    className: 'bg-[rgba(148,163,184,.12)] text-[#94a3b8] border-[rgba(148,163,184,.22)]',
  },
};

const ROLE_LABEL: Record<string, string> = {
  COMMERCIAL_MANAGER: 'مدیر بازرگانی',
  FINANCE_MANAGER: 'مدیر مالی',
  SENIOR_MANAGER: 'مدیر ارشد',
  CEO: 'مدیر عامل',
  BOARD_CHAIR: 'رئیس هیئت مدیره',
  SITE_ADMIN: 'ادمین سایت',
  IT_MANAGER: 'مدیر IT',
};

/**
 * ارجاعات من — dark cards matching employee screenshots
 * (شروع بررسی / تکمیل و بستن / ارجاع این کار).
 */
export default function MyReferralsPage() {
  const [result, setResult] = useState<MyReferralListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reportBody, setReportBody] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reportAttachments, setReportAttachments] = useState<ReferralAttachment[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchMyReferrals();
      setResult(data);
      return data;
    } catch {
      setError('خطا در دریافت ارجاعات.');
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openReview(r: MyReferral) {
    setExpandedId(r.id);
    setNotice(null);
    setReportError(null);
  }

  async function onSubmitReport(referral: MyReferral) {
    if (!reportBody.trim()) {
      setReportError('متن گزارش را وارد کنید.');
      setExpandedId(referral.id);
      return;
    }
    setReportError(null);
    setSubmitting(true);
    setBusyId(referral.id);
    try {
      await submitReferralReport(
        referral.id,
        reportBody.trim(),
        reportAttachments.map((a) => a.id),
      );
      setReportBody('');
      setReportAttachments([]);
      setNotice('گزارش شما ثبت شد ✓');
      await load();
    } catch (e) {
      setReportError(e instanceof Error ? e.message : 'خطا در ثبت گزارش.');
    } finally {
      setSubmitting(false);
      setBusyId(null);
    }
  }

  async function onForward(referral: MyReferral) {
    const text = window.prompt(
      'توضیح ارجاع به مدیر (اختیاری):',
      'لطفاً این مورد را پیگیری کنید.',
    );
    if (text === null) return;
    setBusyId(referral.id);
    setNotice(null);
    try {
      await sendEmployeeManagerMessage({
        toId: referral.from.id,
        body: text.trim()
          ? `ارجاع کار «${referral.title}»: ${text.trim()}`
          : `درخواست ارجاع مجدد کار «${referral.title}»`,
      });
      setNotice('درخواست ارجاع برای مدیر ارسال شد.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ارسال ارجاع.');
    } finally {
      setBusyId(null);
    }
  }

  if (!result) {
    return (
      <div className="px-[21px] pb-[34px] pt-[18px]">
        {error ? (
          <p className="text-sm text-[#f87171]">{error}</p>
        ) : (
          <p className="text-sm text-[#6b7b94]">در حال بارگذاری…</p>
        )}
      </div>
    );
  }

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]" dir="rtl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[20.5px] font-black text-white">ارجاعات من</h1>
          <p className="mt-1 text-[11.5px] text-[#6b7b94]">
            درخواست‌های ارجاع‌شده به شما در واحد بازرگانی
          </p>
        </div>
        <EmployeeUnitPill />
      </div>

      {error && (
        <p className="mb-4 rounded-[12px] border border-[rgba(248,113,113,.28)] bg-[rgba(248,113,113,.1)] px-4 py-3 text-sm text-[#f87171]">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-[12px] border border-[rgba(52,211,153,.28)] bg-[rgba(52,211,153,.1)] px-4 py-3 text-sm text-[#34d399]">
          {notice}
        </p>
      )}

      {result.referrals.length === 0 ? (
        <p
          className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] py-10 text-center text-sm text-[#6b7b94]"
          data-testid="my-referrals-empty"
        >
          ارجاعی به شما ثبت نشده است.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {result.referrals.map((r) => {
            const st = STATUS_META[r.status];
            const open = r.status !== 'CLOSED';
            const expanded = expandedId === r.id;
            const busy = busyId === r.id;
            const roleFa = ROLE_LABEL[r.from.role] ?? r.from.role;

            return (
              <li
                key={r.id}
                data-testid={`my-referral-${r.id}`}
                className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-5 shadow-lg shadow-black/20"
                onClick={() => openReview(r)}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-1 items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[rgba(168,85,247,.15)] text-[#c084fc]">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                        />
                      </svg>
                    </span>
                    <div>
                      <h2 className="m-0 text-[14.5px] font-extrabold text-white">{r.title}</h2>
                      <p className="mt-2 text-[11px] text-[#6b7b94]">
                        ارجاع از {roleFa} · {formatJalaliDateTime(r.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-[10.5px] font-bold ${st.className}`}
                  >
                    {st.label}
                  </span>
                </div>

                {r.body ? (
                  <div className="mt-4 rounded-[12px] border border-[#28344c] bg-[#0b1220] px-4 py-3 text-[12px] leading-relaxed text-[#cbd5e1]">
                    <span className="font-bold text-[#e7ecf3]">توضیح مدیر: </span>
                    {r.body}
                  </div>
                ) : null}

                <AttachmentList attachments={r.attachments} variant="neutral" />

                {open ? (
                  <div
                    className="mt-4 flex flex-wrap gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(r.status === 'SENT' || r.status === 'REVIEWING') && !expanded ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openReview(r)}
                        className="rounded-[11px] bg-[#1668c4] px-4 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-[#1668c4]/25 transition hover:bg-[#1a74d4] disabled:opacity-50"
                      >
                        شروع بررسی
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || submitting}
                      onClick={() => {
                        if (!expanded) {
                          openReview(r);
                          return;
                        }
                        void onSubmitReport(r);
                      }}
                      className="rounded-[11px] border border-[rgba(52,211,153,.4)] bg-transparent px-4 py-2.5 text-[12px] font-bold text-[#34d399] transition hover:bg-[rgba(52,211,153,.1)] disabled:opacity-50"
                    >
                      تکمیل و بستن
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onForward(r)}
                      className="rounded-[11px] border border-[rgba(168,85,247,.4)] bg-transparent px-4 py-2.5 text-[12px] font-bold text-[#c084fc] transition hover:bg-[rgba(168,85,247,.1)] disabled:opacity-50"
                    >
                      ارجاع این کار
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 text-[12px] text-[#6b7b94]">این ارجاع بسته شده است.</p>
                )}

                {expanded && open ? (
                  <section
                    className="mt-4 rounded-[12px] border border-[#28344c] bg-[#18223a] p-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="mb-2 m-0 text-[12.5px] font-bold text-white">ثبت گزارش</h3>
                    {r.hasMyReport && (
                      <p className="mb-3 rounded-[10px] border border-[rgba(52,211,153,.25)] bg-[rgba(52,211,153,.1)] px-3 py-2 text-[11px] text-[#34d399]">
                        شما پیش‌تر گزارشی برای این ارجاع ثبت کرده‌اید. در صورت نیاز می‌توانید گزارش
                        تکمیلی ارسال کنید.
                      </p>
                    )}
                    <textarea
                      data-testid="referral-report-body"
                      value={reportBody}
                      onChange={(e) => setReportBody(e.target.value)}
                      placeholder="گزارش خود را وارد کنید…"
                      rows={4}
                      className="w-full rounded-[10px] border border-[#28344c] bg-[#0b1220] p-3 text-[12px] text-[#e7ecf3] outline-none transition focus:border-[#1668c4]"
                    />
                    <div className="mt-3">
                      <label className="mb-1 block text-[11px] font-bold text-[#9fb0c7]">
                        بارگذاری مستندات (PDF یا تصویر)
                      </label>
                      <AttachmentPicker value={reportAttachments} onChange={setReportAttachments} />
                    </div>
                    {reportError && (
                      <p role="alert" className="mt-2 text-[11px] text-[#f87171]">
                        {reportError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void onSubmitReport(r)}
                      disabled={submitting}
                      className="mt-3 rounded-[11px] bg-[#1668c4] px-4 py-2 text-[12px] font-bold text-white transition hover:bg-[#1a74d4] disabled:opacity-60"
                    >
                      {submitting ? 'در حال ثبت…' : 'ثبت گزارش'}
                    </button>
                  </section>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
