import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { fetchAgencyRequest, approveAgencyRequest, rejectAgencyRequest, referAgencyRequest } from '../../api/agencies';
import { fetchStaffDirectory } from '../../api/cartable';
import { formatJalaliDate } from '../../lib/jalali';
import type { AgencyMembershipRequest } from '../../types/agencies';
import type { StaffDirectoryEntry } from '../../types/cartable';

const STATUS_LABELS: Record<AgencyMembershipRequest['status'], string> = {
  PENDING: 'در انتظار بررسی',
  REFERRED: 'ارجاع‌شده',
  APPROVED: 'تأییدشده',
  REJECTED: 'ردشده',
};

export default function RequestDetailPage() {
  const { requestId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  // The refer block appears in Senior/Commercial + Site Admin (design).
  const canRefer =
    user?.role === 'SENIOR_MANAGER' || user?.role === 'COMMERCIAL_MANAGER' || user?.role === 'SITE_ADMIN';
  // Commercial routes the request; finance performs the final account creation.
  const canApproveCommercial = user?.role === 'COMMERCIAL_MANAGER';
  const canApproveFinance = user?.role === 'FINANCE_MANAGER';

  const [request, setRequest] = useState<AgencyMembershipRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [referTo, setReferTo] = useState('');
  const [referNote, setReferNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRequest(await fetchAgencyRequest(requestId));
    } catch {
      setError('خطا در دریافت اطلاعات درخواست.');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canRefer) return;
    fetchStaffDirectory()
      .then(setStaff)
      .catch(() => setStaff([]));
  }, [canRefer]);

  async function onRefer() {
    if (!referTo) return;
    setBusy(true);
    setError(null);
    try {
      await referAgencyRequest(requestId, referTo, referNote.trim() || undefined);
      const target = staff.find((s) => s.id === referTo);
      setNotice(`این درخواست به ${target?.fullName ?? 'مدیر مقصد'} ارجاع شد.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت ارجاع.');
    } finally {
      setBusy(false);
    }
  }

  async function onApprove() {
    setBusy(true);
    setError(null);
    try {
      const result = await approveAgencyRequest(requestId);
      if (result.stage === 'AWAITING_FINANCE') {
        setNotice('تأیید بازرگانی ثبت شد؛ درخواست اکنون منتظر تأیید مدیر مالی است.');
        await load();
        setBusy(false);
        return;
      }
      navigate(`/panel/agencies/${result.agencyId}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در تأیید درخواست.');
      setBusy(false);
    }
  }

  async function onReject() {
    setBusy(true);
    setError(null);
    try {
      await rejectAgencyRequest(requestId);
      navigate('/panel/agencies', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در رد درخواست.');
      setBusy(false);
    }
  }

  if (loading) return <p className="p-10 text-center text-sm text-panel-muted">در حال بارگذاری…</p>;
  if (!request)
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-danger">{error ?? 'درخواست یافت نشد.'}</p>
        <Link to="/panel/agencies" className="mt-3 inline-block text-xs font-bold text-accent">
          بازگشت به فهرست آژانس‌ها
        </Link>
      </div>
    );

  const decidable = request.status === 'PENDING' || request.status === 'REFERRED';
  const canApprove =
    (canApproveCommercial && request.approvalStage === 'AWAITING_COMMERCIAL') ||
    (canApproveFinance && request.approvalStage === 'AWAITING_FINANCE');

  return (
    <div className="space-y-4 p-8">
      <Link to="/panel/agencies" className="inline-block text-xs font-bold text-accent">
        بازگشت به فهرست آژانس‌ها
      </Link>

      {error && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      <header className="rounded-2xl bg-gradient-to-l from-[#7c5a11] to-[#8a6a14] p-6 text-white">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-2xl font-black">
            {request.applicantName.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black">{request.applicantName}</h1>
            <p className="mt-1 text-xs text-white/70">درخواست عضویت به‌عنوان آژانس همکار</p>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold">
            {STATUS_LABELS[request.status]}
          </span>
        </div>
      </header>

      <section className="rounded-xl border border-panel-border bg-panel-surface p-5">
        <h2 className="mb-4 text-sm font-bold text-panel-ink">اطلاعات آژانس متقاضی</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs md:grid-cols-3">
          <div>
            <dt className="text-panel-muted">مدیر مسئول</dt>
            <dd className="mt-0.5 font-bold text-panel-ink">{request.managerName}</dd>
          </div>
          <div>
            <dt className="text-panel-muted">شماره مجوز بند ب</dt>
            <dd className="mt-0.5 font-bold text-panel-ink">
              <span className="ltr font-num">{request.licenseNo}</span>
            </dd>
          </div>
          <div>
            <dt className="text-panel-muted">شهر</dt>
            <dd className="mt-0.5 font-bold text-panel-ink">{request.city}</dd>
          </div>
          <div>
            <dt className="text-panel-muted">تلفن</dt>
            <dd className="mt-0.5 font-bold text-panel-ink">
              <span className="ltr font-num">{request.phone}</span>
            </dd>
          </div>
          <div>
            <dt className="text-panel-muted">ایمیل</dt>
            <dd className="mt-0.5 font-bold text-panel-ink">
              <span className="ltr">{request.email}</span>
            </dd>
          </div>
          <div>
            <dt className="text-panel-muted">تاریخ درخواست</dt>
            <dd className="font-num mt-0.5 font-bold text-panel-ink">{formatJalaliDate(request.createdAt)}</dd>
          </div>
        </dl>
        {request.reviewNote && (
          <div className="mt-4 rounded-lg bg-panel-canvas p-3 text-xs">
            <span className="text-panel-muted">یادداشت بررسی: </span>
            <span className="font-bold text-panel-ink">{request.reviewNote}</span>
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-panel-border bg-panel-surface p-4 text-xs">
          <p className="font-bold text-panel-ink">تأیید مدیر بازرگانی</p>
          <p className="mt-2 text-panel-muted">
            {request.commercialApprovedAt
              ? `ثبت‌شده در ${formatJalaliDate(request.commercialApprovedAt)}`
              : 'در انتظار بررسی'}
          </p>
        </div>
        <div className="rounded-xl border border-panel-border bg-panel-surface p-4 text-xs">
          <p className="font-bold text-panel-ink">تأیید مدیر مالی</p>
          <p className="mt-2 text-panel-muted">
            {request.financeApprovedAt
              ? `ثبت‌شده در ${formatJalaliDate(request.financeApprovedAt)}`
              : request.commercialApprovedAt
                ? 'در انتظار بررسی'
                : 'پس از تأیید بازرگانی فعال می‌شود'}
          </p>
        </div>
      </section>

      {notice && <p className="rounded-lg bg-[#34d39915] p-3 text-sm text-[#34d399]">{notice}</p>}

      {decidable && canRefer && (
        <section className="rounded-xl border border-panel-border bg-panel-surface p-5">
          <h2 className="text-sm font-bold text-panel-ink">ارجاع درخواست</h2>
          <p className="mt-1 text-[11px] text-panel-muted">می‌توانید بررسی این درخواست را به مدیران دیگر ارجاع دهید.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-panel-ink" htmlFor="refer-to">
                گیرندهٔ ارجاع را انتخاب کنید
              </label>
              <select
                id="refer-to"
                value={referTo}
                onChange={(e) => setReferTo(e.target.value)}
                className="w-full rounded-lg border border-panel-border-2 bg-panel-canvas p-3 text-xs text-panel-ink outline-none transition focus:border-accent"
              >
                <option value="">انتخاب گیرندهٔ ارجاع…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} — {s.roleLabelFa}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-panel-ink" htmlFor="refer-note">
                توضیح ارجاع (اختیاری)
              </label>
              <input
                id="refer-note"
                value={referNote}
                onChange={(e) => setReferNote(e.target.value)}
                placeholder="توضیح یا دستور خود را برای گیرندهٔ ارجاع بنویسید…"
                className="w-full rounded-lg border border-panel-border-2 bg-panel-canvas p-3 text-xs text-panel-ink outline-none transition focus:border-accent"
              />
            </div>
          </div>
          <button
            disabled={!referTo || busy}
            onClick={() => void onRefer()}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent/90 disabled:opacity-50"
          >
            ثبت و ارسال ارجاع
          </button>
        </section>
      )}

      {decidable && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-panel-border bg-panel-surface p-5">
          <p className="text-xs text-panel-muted">پس از بررسی مدارک، درخواست را تأیید یا لغو کنید.</p>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => void onReject()}
              className="rounded-lg bg-danger px-4 py-2 text-xs font-bold text-white transition hover:bg-danger/90 disabled:opacity-60"
            >
              انصراف
            </button>
            {canApprove && (
              <button
                disabled={busy}
                onClick={() => void onApprove()}
                className="rounded-lg bg-[#34d399] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#2bb583] disabled:opacity-60"
              >
                {canApproveFinance ? 'تأیید مالی و ایجاد پروفایل آژانس' : 'تأیید بازرگانی و ارسال به مالی'}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
