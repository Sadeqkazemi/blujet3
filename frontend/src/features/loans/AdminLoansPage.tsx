import { useEffect, useState } from 'react';
import { fetchAdminLoanApplication, fetchAdminLoanApplications } from '../../api/loans';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import { faDigits, faMoney } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import type { LoanApplication, LoanDisplayStatus } from '../../types/loans';

const STATUS: Record<LoanDisplayStatus, { label: string; className: string }> = {
  processing: { label: 'در حال ارسال', className: 'bg-blue-500/15 text-blue-300' },
  awaiting_bank: { label: 'در انتظار پاسخ اعتبارسنجی', className: 'bg-amber-500/15 text-amber-300' },
  under_review: { label: 'در حال بررسی بانک', className: 'bg-violet-500/15 text-violet-300' },
  approved: { label: 'تأیید بانک', className: 'bg-emerald-500/15 text-emerald-300' },
  rejected: { label: 'رد بانک', className: 'bg-red-500/15 text-red-300' },
  disbursed: { label: 'پرداخت‌شده', className: 'bg-emerald-500/15 text-emerald-300' },
  cancelled: { label: 'لغوشده', className: 'bg-slate-500/15 text-slate-300' },
  failed: { label: 'ناموفق', className: 'bg-red-500/15 text-red-300' },
  unknown: { label: 'نامشخص', className: 'bg-slate-500/15 text-slate-300' },
};

function customerLabel(row: LoanApplication) {
  return row.customer?.fullName?.trim() || `مشتری ${row.userId?.slice(0, 8) ?? 'نامشخص'}`;
}

export default function AdminLoansPage() {
  const [items, setItems] = useState<LoanApplication[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<LoanApplication | null>(null);
  const pageSize = 20;

  useEffect(() => {
    setItems(null);
    setError(null);
    fetchAdminLoanApplications(page, pageSize)
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch(() => setError('دریافت درخواست‌های وام از سرور انجام نشد.'));
  }, [page]);

  async function openDetail(id: string) {
    setError(null);
    try {
      setDetail(await fetchAdminLoanApplication(id));
    } catch {
      setError('جزئیات درخواست وام دریافت نشد.');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-[15px] px-[21px] pb-[34px] pt-[18px]" data-testid="admin-loans-page">
      <header>
        <h1 className="m-0 text-[20.5px] font-black text-white">درخواست وام</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">بررسی وضعیت درخواست وام و اعتبارسنجی مشتریان باشگاه مشتریان</p>
      </header>

      <section className="flex items-center justify-between gap-4 rounded-[16px] border border-[#274166] bg-[#1a2a46] px-[18px] py-[17px]">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-[rgba(59,130,246,.16)] text-[#60a5fa]">
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 9h18M7 15h4" />
            </svg>
          </span>
          <div>
            <h2 className="m-0 text-[16px] font-black text-white">درخواست وام باشگاه مشتریان</h2>
            <p className="mt-1 text-[11px] text-[#9fb0c7]">مشتریانی که برای وام بلو بانک اقدام کرده‌اند — روند اعتبارسنجی و پرداخت بانک فقط‌خواندنی است</p>
          </div>
        </div>
        <span className="font-num rounded-full bg-[rgba(59,130,246,.16)] px-3 py-1.5 text-[11px] font-extrabold text-[#60a5fa]">{faDigits(total)} درخواست</span>
      </section>

      {error && <p role="alert" className="rounded-[12px] bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}

      <section className="overflow-hidden rounded-[16px] border border-[#1f2a3d] bg-[#141d2e]">
        {items === null ? (
          <p className="py-10 text-center text-xs text-panel-muted">در حال بارگذاری…</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-xs text-panel-muted">درخواستی ثبت نشده است.</p>
        ) : (
          items.map((row) => {
            const status = STATUS[row.displayStatus] ?? STATUS.unknown;
            const initials = customerLabel(row).split(/\s+/).map((part) => part[0]).join('').slice(0, 2);
            return (
              <article key={row.id} className="flex flex-wrap items-center gap-3 border-b border-[#1f2a3d] px-[18px] py-[14px] last:border-b-0">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-[#1d2a43] text-[11px] font-black text-[#f87171]">{initials || '؟'}</span>
                <div className="min-w-[190px] flex-1">
                  <h3 className="m-0 text-[13px] font-extrabold text-white">{customerLabel(row)}</h3>
                  <p className="font-num mt-1 text-[10.5px] text-[#6b7b94]">{row.customer?.phone ?? row.userId ?? 'شناسه مشتری موجود نیست'} · مبلغ {faMoney(row.requestedAmountIrr)} تومان</p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${status.className}`}>{status.label}</span>
                <span className="min-w-[120px] text-[10.5px] text-[#6b7b94]">{formatJalaliDateTime(row.createdAt)}</span>
                <button type="button" onClick={() => void openDetail(row.id)} className="text-[11px] font-extrabold text-[#60a5fa]">مشاهده وضعیت ←</button>
              </article>
            );
          })
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} variant="dark" />
      </section>

      <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-6 text-amber-200">تصمیم تأیید یا رد توسط بانک انجام می‌شود؛ ادمین سایت فقط وضعیت همگام‌شده را مشاهده می‌کند.</p>

      {detail && (
        <Modal title={customerLabel(detail)} onClose={() => setDetail(null)} maxWidthClass="max-w-xl">
          <div className="space-y-4" data-testid="admin-loan-detail">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#273755] bg-[#1a2944] p-4">
              <div>
                <h4 className="m-0 text-sm font-black text-white">{customerLabel(detail)}</h4>
                <p className="font-num mt-1 text-[11px] text-[#91a1bb]" dir="ltr">{detail.id}</p>
              </div>
              <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${(STATUS[detail.displayStatus] ?? STATUS.unknown).className}`}>
                {(STATUS[detail.displayStatus] ?? STATUS.unknown).label}
              </span>
            </div>

            <div className="rounded-xl border border-[#273755] bg-[#101a2b] p-4 text-xs leading-6 text-[#b7c3d6]">
              وضعیت این درخواست از بانک همگام می‌شود و تصمیم تأیید یا رد در اختیار ادمین سایت نیست.
            </div>

            <section>
              <h4 className="mb-2 text-xs font-black text-white">اطلاعات درخواست و اعتبارسنجی</h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-[#101a2b] p-3">
                  <p className="m-0 text-[10px] text-[#8494ad]">شماره تماس مشتری</p>
                  <p dir="ltr" className="font-num mt-1 m-0 text-xs text-white">{detail.customer?.phone ?? '—'}</p>
                </div>
                <div className="rounded-xl bg-[#101a2b] p-3">
                  <p className="m-0 text-[10px] text-[#8494ad]">مبلغ درخواست</p>
                  <p className="font-num mt-1 m-0 text-xs font-bold text-emerald-300">{faMoney(detail.requestedAmountIrr)} تومان</p>
                </div>
                <div className="rounded-xl bg-[#101a2b] p-3">
                  <p className="m-0 text-[10px] text-[#8494ad]">شناسه بانک</p>
                  <p dir="ltr" className="font-num mt-1 m-0 text-xs text-white">{detail.bankReferenceId ?? '—'}</p>
                </div>
                <div className="rounded-xl bg-[#101a2b] p-3">
                  <p className="m-0 text-[10px] text-[#8494ad]">آخرین به‌روزرسانی</p>
                  <p className="mt-1 m-0 text-xs text-white">{detail.lastSyncedAt ? formatJalaliDateTime(detail.lastSyncedAt) : '—'}</p>
                </div>
              </div>
            </section>

            <p className="m-0 rounded-lg border border-[#273755] bg-[#1a2944] p-3 text-[11px] text-[#b7c3d6]">
              شناسه ثبت درخواست: <span dir="ltr" className="font-num text-white">{detail.id}</span>
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
