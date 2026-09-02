import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  approveIdentityVerification,
  fetchIdentityIdCard,
  fetchIdentityVerifications,
  rejectIdentityVerification,
} from '../../api/identity-admin';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDate, formatJalaliDateTime } from '../../lib/jalali';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import type {
  IdentityReviewStatus,
  IdentityVerificationRow,
} from '../../types/identity-admin';

const STATUS_META: Record<IdentityReviewStatus, { label: string; className: string }> = {
  SUBMITTED: { label: 'در انتظار بررسی', className: 'bg-[#f59e0b24] text-[#b45309]' },
  APPROVED: { label: 'تأیید شد', className: 'bg-[#10b98124] text-[#059669]' },
  REJECTED: { label: 'رد شد', className: 'bg-[#ef444424] text-[#b91c1c]' },
};

export default function IdentityAdminPage() {
  const [rows, setRows] = useState<IdentityVerificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<IdentityVerificationRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchIdentityVerifications());
    } catch {
      setError('خطا در دریافت فهرست درخواست‌های احراز هویت.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(
    () => (rows ?? []).filter((r) => r.status === 'SUBMITTED').length,
    [rows],
  );

  async function onApprove(row: IdentityVerificationRow) {
    setError(null);
    setBusyId(row.id);
    try {
      await approveIdentityVerification(row.id);
      setNotice(`احراز هویت ${row.fullName} تأیید شد ✓`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت تأیید.');
    } finally {
      setBusyId(null);
    }
  }

  async function onConfirmReject() {
    if (!rejecting || !rejectReason.trim()) return;
    setError(null);
    setBusyId(rejecting.id);
    try {
      await rejectIdentityVerification(rejecting.id, rejectReason.trim());
      setNotice(`احراز هویت ${rejecting.fullName} رد شد.`);
      setRejecting(null);
      setRejectReason('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت رد درخواست.');
    } finally {
      setBusyId(null);
    }
  }

  async function onDownloadIdCard(row: IdentityVerificationRow) {
    setError(null);
    try {
      const blob = await fetchIdentityIdCard(row.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = row.idCardFileName ?? 'id-card';
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در دریافت کارت ملی.');
    }
  }

  const list = rows ?? [];
  const listPager = usePagination(list);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-black text-ink">احراز هویت مشتریان</h1>
        <p className="mt-1 text-sm text-muted">
          بررسی مدارک ارسالی کاربران (کارت ملی) و تأیید یا رد درخواست‌ها
          {rows !== null && (
            <>
              {' · '}
              <span className="font-bold text-ink" data-testid="kyc-pending-count">
                {faDigits(pendingCount)}
              </span>{' '}
              در انتظار بررسی
            </>
          )}
        </p>
      </div>

      {error && <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-[#10b98115] p-3 text-sm text-[#059669]">{notice}</p>}

      <section className="rounded-xl border border-border bg-white p-5">
        {rows === null ? (
          <p className="py-6 text-center text-sm text-muted">در حال بارگذاری…</p>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">درخواستی برای بررسی وجود ندارد.</p>
        ) : (
          <ul className="divide-y divide-border">
            {listPager.pageItems.map((r) => {
              const st = STATUS_META[r.status];
              return (
                <li key={r.id} data-testid="kyc-row" className="flex flex-wrap items-center gap-3 py-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-sm font-black text-accent">
                    {r.fullName.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-ink">{r.fullName}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
                      <span className="ltr font-num">{faDigits(r.phone)}</span>
                      {r.nationalId && (
                        <span>
                          کد ملی: <span className="ltr font-num">{faDigits(r.nationalId)}</span>
                        </span>
                      )}
                      {r.birthDate && (
                        <span>
                          تولد: <span className="font-num">{formatJalaliDate(r.birthDate)}</span>
                        </span>
                      )}
                    </div>
                    {r.status === 'REJECTED' && r.rejectReason && (
                      <div className="mt-1 text-[11px] text-danger">دلیل رد: {r.rejectReason}</div>
                    )}
                  </div>
                  {r.submittedAt && (
                    <div className="text-left">
                      <div className="text-[10px] text-muted">تاریخ ارسال</div>
                      <div className="font-num text-xs font-bold text-ink">
                        {formatJalaliDateTime(r.submittedAt)}
                      </div>
                    </div>
                  )}
                  <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${st.className}`}>
                    {st.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {r.idCardFileName && (
                      <button
                        onClick={() => void onDownloadIdCard(r)}
                        className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-accent"
                      >
                        کارت ملی
                      </button>
                    )}
                    {r.status === 'SUBMITTED' && (
                      <>
                        <button
                          onClick={() => void onApprove(r)}
                          disabled={busyId === r.id}
                          className="rounded-lg bg-[#10b98124] px-3 py-2 text-[11px] font-bold text-[#059669] disabled:opacity-50"
                        >
                          تأیید
                        </button>
                        <button
                          onClick={() => {
                            setRejecting(r);
                            setRejectReason('');
                          }}
                          disabled={busyId === r.id}
                          className="rounded-lg bg-[#ef444424] px-3 py-2 text-[11px] font-bold text-[#b91c1c] disabled:opacity-50"
                        >
                          رد
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination
          page={listPager.page}
          totalPages={listPager.totalPages}
          onChange={listPager.setPage}
          variant="light"
        />
      </section>

      {rejecting && (
        <Modal title={`رد احراز هویت · ${rejecting.fullName}`} onClose={() => setRejecting(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted">
              دلیل رد به کاربر در تب «احراز هویت» پنل کاربری نمایش داده می‌شود و او می‌تواند
              مدارک را اصلاح و دوباره ارسال کند.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="دلیل رد مدارک…"
              rows={3}
              className="rounded-lg border border-border p-3 text-xs outline-none"
            />
            <button
              onClick={() => void onConfirmReject()}
              disabled={!rejectReason.trim() || busyId === rejecting.id}
              className="rounded-lg bg-[#ef444424] px-3 py-2 text-xs font-bold text-[#b91c1c] disabled:opacity-50"
            >
              ثبت رد درخواست
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
