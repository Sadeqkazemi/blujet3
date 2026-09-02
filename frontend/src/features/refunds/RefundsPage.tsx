import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchRefundDetail, fetchRefunds, payRefund, referRefund } from '../../api/refunds';
import { fetchStaffDirectory } from '../../api/cartable';
import { airportCityName } from '../../lib/airport-cities';
import { faDigits, faMoney } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import { useAuth } from '../../hooks/useAuth';
import { useStepUp } from '../../hooks/useStepUp';
import { usePagination } from '../../hooks/usePagination';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import type { RefundDetail, RefundListRow, RefundsResult, RefundStatus } from '../../types/refunds';
import type { StaffDirectoryEntry } from '../../types/cartable';

/** Global panel list rule: 10 records per page. */
const REFUND_PAGE_SIZE = 10;

const STATUS_FINANCE: Record<RefundStatus, { label: string; className: string }> = {
  SUBMITTED: { label: 'ثبت مشتری', className: 'bg-[#f59e0b24] text-[#fbbf24]' },
  REVIEW: { label: 'بررسی ادمین', className: 'bg-[#3b82f624] text-[#60a5fa]' },
  FINANCE: { label: 'آمادهٔ پرداخت', className: 'bg-[#a855f724] text-[#c084fc]' },
  PAID: { label: 'پرداخت شد', className: 'bg-[#34d39924] text-[#34d399]' },
};

const STATUS_ADMIN: Record<RefundStatus, { label: string; className: string }> = {
  SUBMITTED: { label: 'در انتظار بررسی', className: 'bg-[#f59e0b24] text-[#fbbf24]' },
  REVIEW: { label: 'در حال بررسی', className: 'bg-[#3b82f624] text-[#60a5fa]' },
  FINANCE: { label: 'ارجاع به مالی', className: 'bg-[#a855f724] text-[#c084fc]' },
  PAID: { label: 'پرداخت شد', className: 'bg-[#34d39924] text-[#34d399]' },
};

function routeLabel(r: RefundListRow) {
  const { originCode, destCode } = r.booking.flightInstance.flight.route;
  return `${airportCityName(originCode, 'fa')} ← ${airportCityName(destCode, 'fa')}`;
}

function refundRef(id: string): string {
  return `RF-${id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}

function matchesRefundQuery(r: RefundListRow, raw: string, statusMeta: typeof STATUS_ADMIN): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    r.passengerName,
    r.booking.pnr,
    r.id,
    refundRef(r.id),
    r.booking.flightInstance.flight.flightNo,
    r.booking.flightInstance.flight.route.originCode,
    r.booking.flightInstance.flight.route.destCode,
    routeLabel(r),
    r.assignee?.fullName ?? '',
    statusMeta[r.status].label,
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('');
}

export default function RefundsPage() {
  const { user } = useAuth();
  const isSiteAdmin = user?.role === 'SITE_ADMIN';
  const statusMeta = isSiteAdmin ? STATUS_ADMIN : STATUS_FINANCE;

  const [data, setData] = useState<RefundsResult | null>(null);
  const [detail, setDetail] = useState<RefundDetail | null>(null);
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [assigneePick, setAssigneePick] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const stepUp = useStepUp('REFUND_PAYOUT');

  const load = useCallback(async () => {
    try {
      setData(await fetchRefunds());
    } catch {
      setError('خطا در دریافت درخواست‌های استرداد.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    fetchStaffDirectory()
      .then(setStaff)
      .catch(() => setStaff([]));
  }, [load]);

  async function openDetail(id: string) {
    setError(null);
    try {
      setAssigneePick('');
      setDetail(await fetchRefundDetail(id));
    } catch {
      setError('خطا در دریافت جزئیات درخواست.');
    }
  }

  async function onRefer() {
    if (!detail || !assigneePick) return;
    try {
      await referRefund(detail.id, assigneePick);
      const target = staff.find((s) => s.id === assigneePick);
      setNotice(`فرآیند به ${target?.fullName ?? 'کارمند مالی'} ارجاع شد ✓`);
      setDetail(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت ارجاع.');
    }
  }

  async function onPay(id: string) {
    setError(null);
    try {
      const fields = await stepUp.confirm();
      await payRefund(id, fields);
      setNotice('تأیید، واریز وجه و بستن پرونده انجام شد ✓');
      setDetail(null);
      await load();
    } catch (e) {
      if (e instanceof Error && e.message === 'CANCELLED') return;
      setError(e instanceof Error ? e.message : 'خطا در پرداخت.');
    }
  }

  const requests = data?.requests ?? [];
  const kpis = data?.kpis;

  const filtered = useMemo(
    () => requests.filter((r) => matchesRefundQuery(r, query, statusMeta)),
    [requests, query, statusMeta],
  );
  const pager = usePagination(filtered, REFUND_PAGE_SIZE);

  useEffect(() => {
    pager.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on query
  }, [query]);

  const financeStaff = useMemo(
    () =>
      staff.filter(
        (s) => s.role === 'FINANCE_MANAGER' || s.role === 'EMPLOYEE' || s.role === 'SITE_ADMIN',
      ),
    [staff],
  );
  const referOptions = isSiteAdmin ? (financeStaff.length > 0 ? financeStaff : staff) : staff;

  return (
    <div className="flex flex-col gap-[15px] px-[21px] pb-[34px] pt-[18px]">
      {isSiteAdmin && (
        <div>
          <h1 className="m-0 text-[20.5px] font-black text-panel-ink">استرداد بلیط</h1>
          <p className="mt-1 text-[11.5px] text-panel-muted">
            بررسی درخواست‌های استرداد و ارجاع به مدیر مالی یا کارمند مالی
          </p>
        </div>
      )}

      <div
        className="panel-surface-card flex flex-wrap items-center gap-3.5 rounded-2xl border border-panel-border bg-panel-surface p-4"
      >
        <span
          className={`flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[14px] ${
            isSiteAdmin ? 'bg-[rgba(245,158,11,.18)] text-[#fbbf24]' : 'bg-[#a855f72e] text-[#c084fc]'
          }`}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 14l-4-4 4-4" />
            <path d="M5 10h9a5 5 0 0 1 0 10h-3" />
          </svg>
        </span>
        <div className="leading-snug">
          <h2 className="m-0 text-[17px] font-black text-panel-ink">استرداد بلیط</h2>
          <p className="mt-0.5 text-[11.5px] text-panel-muted">
            {isSiteAdmin
              ? 'درخواست‌های ثبت‌شده توسط مشتریان — بررسی و ارجاع به مدیر مالی یا کارمند مالی'
              : 'درخواست‌های استرداد ارجاع‌شده از ادمین سایت — بررسی، تأیید، پرداخت و بستن پرونده'}
          </p>
        </div>
        {kpis && (
          <span
            className={`ms-auto rounded-full px-3.5 py-1.5 text-[11.5px] font-extrabold ${
              isSiteAdmin
                ? 'bg-[rgba(245,158,11,.16)] text-[#fbbf24]'
                : 'bg-[#a855f729] text-[#c084fc]'
            }`}
          >
            {isSiteAdmin
              ? `${faDigits(kpis.awaitingAdmin)} در انتظار بررسی`
              : `${faDigits(kpis.payoutQueue)} در صف پرداخت`}
          </span>
        )}
      </div>

      {error && <p className="rounded-lg bg-[#f8717124] p-3 text-sm text-[#f87171]">{error}</p>}
      {notice && <p className="rounded-lg bg-[#34d39924] p-3 text-sm text-[#34d399]">{notice}</p>}

      {kpis && (
        <div className="grid grid-cols-3 gap-[13px]">
          {isSiteAdmin ? (
            <>
              <div className="panel-surface-card rounded-[14px] border border-panel-border bg-panel-surface p-[13px]">
                <div className="mb-1.5 text-[11px] text-[#6b7b94]">در انتظار بررسی</div>
                <div className="font-num text-xl font-black text-[#f59e0b]">
                  {faDigits(kpis.awaitingAdmin)}
                </div>
              </div>
              <div className="panel-surface-card rounded-[14px] border border-panel-border bg-panel-surface p-[13px]">
                <div className="mb-1.5 text-[11px] text-[#6b7b94]">ارجاع‌شده به مالی</div>
                <div className="font-num text-xl font-black text-[#a855f7]">
                  {faDigits(kpis.payoutQueue)}
                </div>
              </div>
              <div className="panel-surface-card rounded-[14px] border border-panel-border bg-panel-surface p-[13px]">
                <div className="mb-1.5 text-[11px] text-[#6b7b94]">پرداخت‌شده</div>
                <div className="font-num text-xl font-black text-[#34d399]">{faDigits(kpis.paid)}</div>
              </div>
            </>
          ) : (
            <>
              <div className="panel-surface-card rounded-[14px] border border-panel-border bg-panel-surface p-[13px]">
                <div className="mb-1.5 text-[11px] text-[#6b7b94]">در صف پرداخت</div>
                <div className="font-num text-xl font-black text-[#a855f7]">
                  {faDigits(kpis.payoutQueue)}
                </div>
              </div>
              <div className="panel-surface-card rounded-[14px] border border-panel-border bg-panel-surface p-[13px]">
                <div className="mb-1.5 text-[11px] text-[#6b7b94]">پرداخت‌شده</div>
                <div className="font-num text-xl font-black text-[#34d399]">{faDigits(kpis.paid)}</div>
              </div>
              <div className="panel-surface-card rounded-[14px] border border-panel-border bg-panel-surface p-[13px]">
                <div className="mb-1.5 text-[11px] text-[#6b7b94]">در انتظار بررسی ادمین</div>
                <div className="font-num text-xl font-black text-[#f59e0b]">
                  {faDigits(kpis.awaitingAdmin)}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <section className="panel-surface-card rounded-2xl border border-panel-border bg-panel-surface p-4">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h2 className="m-0 text-[15px] font-extrabold text-panel-ink">
              {isSiteAdmin ? 'درخواست‌های استرداد بلیط' : 'فهرست درخواست‌های استرداد'}
            </h2>
            <p className="mt-1 text-[11.5px] text-[#6b7b94]">
              {isSiteAdmin
                ? 'پس از بررسی، به مدیر مالی یا یک کارمند مالی ارجاع دهید.'
                : 'روی هر کارت بزنید تا اطلاعات مسافر، شبا و مبلغ نمایش داده شود.'}
            </p>
          </div>
          <span className="rounded-lg border border-[#28344c] bg-[#18223a] px-3 py-1.5 text-[11px] font-bold text-[#9fb0c7]">
            {faDigits(query.trim() ? filtered.length : requests.length)} درخواست
          </span>
        </div>

        <div className="mb-3.5">
          <label htmlFor="refund-search" className="sr-only">
            جستجوی درخواست استرداد
          </label>
          <input
            id="refund-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو بر اساس نام مسافر، PNR، شماره پرواز یا مسیر…"
            className="h-[46px] w-full rounded-xl border border-panel-border-2 bg-panel-surface-2 px-4 text-xs text-panel-ink outline-none transition placeholder:text-panel-muted focus:border-panel-accent"
          />
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-[#6b7b94]">در حال بارگذاری…</p>
        ) : requests.length === 0 ? (
          <p className="rounded-[14px] border border-[#22304a] bg-[#0f1726] py-6 text-center text-xs text-[#6b7b94]">
            درخواست استردادی ثبت نشده است.
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded-[14px] border border-[#22304a] bg-[#0f1726] py-6 text-center text-xs text-[#6b7b94]">
            درخواستی با این عبارت یافت نشد.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-[11px]">
              {pager.pageItems.map((r) => {
                const st = statusMeta[r.status];
                if (isSiteAdmin) {
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => void openDetail(r.id)}
                        className="flex w-full flex-wrap items-center gap-[13px] rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] px-[15px] py-[13px] text-right transition hover:border-[#2f3f5c] hover:bg-[#161f31]"
                      >
                        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[#1d2a40] text-sm font-extrabold text-[#fbbf24]">
                          {initials(r.passengerName)}
                        </span>
                        <span className="min-w-0 leading-snug">
                          <span className="block text-sm font-extrabold text-[#f2f5f9]">
                            {r.passengerName}
                          </span>
                          <span className="ltr font-num mt-0.5 flex items-center gap-2 text-[10px] text-[#6b7b94]">
                            <span className="text-[#60a5fa]">{refundRef(r.id)}</span>
                            <span>·</span>
                            <span>{r.booking.pnr}</span>
                          </span>
                        </span>
                        <span className="flex min-w-[120px] flex-col gap-0.5">
                          <span className="text-[9px] text-[#6b7b94]">مسیر</span>
                          <span className="text-[11.5px] font-bold text-[#cdd6e3]">{routeLabel(r)}</span>
                        </span>
                        <span className="flex min-w-[110px] flex-col gap-0.5">
                          <span className="text-[9px] text-[#6b7b94]">قابل استرداد</span>
                          <span className="font-num text-[12.5px] font-extrabold text-[#34d399]">
                            {faMoney(r.refundableIrr)}
                          </span>
                        </span>
                        <span
                          className={`ms-auto flex-none rounded-[18px] px-[11px] py-[5px] text-[10.5px] font-extrabold ${st.className}`}
                        >
                          {st.label}
                        </span>
                        <span className="flex-none text-[11px] font-bold text-[#60a5fa]">
                          مشاهده و ارجاع ←
                        </span>
                      </button>
                    </li>
                  );
                }

                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-[#22304a] bg-[#0f1726] p-3.5"
                  >
                    <button
                      type="button"
                      onClick={() => void openDetail(r.id)}
                      className="flex min-w-0 flex-1 items-center gap-3.5 text-right"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1d2a40] text-sm font-extrabold text-[#60a5fa]">
                        {r.passengerName.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-extrabold text-[#e7ecf3]">
                          {r.passengerName}{' '}
                          <span className="ltr font-num text-[10px] text-[#6b7b94]">{r.booking.pnr}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[#8a97ab]">
                          {routeLabel(r)}
                          {r.assignee ? ` · ارجاع به: ${r.assignee.fullName}` : ''}
                        </span>
                      </span>
                    </button>
                    <div className="text-left">
                      <div className="text-[9px] text-[#6b7b94]">شماره پرواز</div>
                      <div className="ltr font-num rounded-lg border border-[#28344c] bg-[#18223a] px-2.5 py-1 text-[11px] font-bold text-[#cdd7e5]">
                        {r.booking.flightInstance.flight.flightNo}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-[9px] text-[#6b7b94]">مبلغ قابل پرداخت</div>
                      <div className="font-num text-sm font-black text-[#e7ecf3]">
                        {faMoney(r.refundableIrr)} تومان
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${st.className}`}>
                      {st.label}
                    </span>
                    {r.status === 'FINANCE' ? (
                      <button
                        type="button"
                        onClick={() => void onPay(r.id)}
                        className="rounded-[10px] bg-[#16a34a] px-3.5 py-2 text-[11px] font-extrabold text-white transition hover:bg-[#15803d]"
                      >
                        تأیید و پرداخت
                      </button>
                    ) : r.status === 'PAID' ? (
                      <span className="text-[11px] font-extrabold text-[#34d399]">پرداخت شد</span>
                    ) : (
                      <span className="rounded-lg border border-[#28344c] bg-[#18223a] px-3 py-2 text-[10.5px] text-[#8a97ab]">
                        در انتظار ادمین
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <Pagination page={pager.page} totalPages={pager.totalPages} onChange={pager.setPage} variant="dark" />
          </>
        )}
      </section>

      {detail && (
        <Modal
          variant="panel"
          title={`درخواست استرداد · بلیط ${detail.booking.pnr}`}
          onClose={() => setDetail(null)}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] text-[#6b7b94]">وضعیت درخواست</span>
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-bold ${statusMeta[detail.status].className}`}
            >
              {statusMeta[detail.status].label}
            </span>
          </div>

          <div className="mb-3 rounded-xl border border-[#22304a] bg-[#0f1726] p-3">
            <h3 className="mb-2 text-xs font-extrabold text-[#8fa1bb]">اطلاعات مسافر و حساب</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
              <div>
                <dt className="text-[#6b7b94]">نام مسافر</dt>
                <dd className="font-bold text-[#e7ecf3]">{detail.passengerName}</dd>
              </div>
              <div>
                <dt className="text-[#6b7b94]">کد ملی</dt>
                <dd className="ltr font-num font-bold text-[#e7ecf3]">{detail.nationalId ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[#6b7b94]">شماره تماس</dt>
                <dd className="ltr font-num font-bold text-[#e7ecf3]">{detail.mobile ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[#6b7b94]">زمان ثبت درخواست</dt>
                <dd className="font-num font-bold text-[#e7ecf3]">
                  {formatJalaliDateTime(detail.createdAt)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[#6b7b94]">شماره شبا (IBAN)</dt>
                <dd className="ltr font-num font-bold text-[#e7ecf3]">{detail.iban}</dd>
              </div>
            </dl>
          </div>

          <div className="mb-3 rounded-xl border border-[#22304a] bg-[#0f1726] p-3">
            <h3 className="mb-2 text-xs font-extrabold text-[#8fa1bb]">اطلاعات پرواز</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
              <div>
                <dt className="text-[#6b7b94]">مسیر</dt>
                <dd className="font-bold text-[#e7ecf3]">{routeLabel(detail)}</dd>
              </div>
              <div>
                <dt className="text-[#6b7b94]">ایرلاین / شماره پرواز</dt>
                <dd className="font-bold text-[#e7ecf3]">
                  blujet ·{' '}
                  <span className="ltr font-num">{detail.booking.flightInstance.flight.flightNo}</span>
                </dd>
              </div>
              <div>
                <dt className="text-[#6b7b94]">تاریخ و ساعت پرواز</dt>
                <dd className="font-num font-bold text-[#e7ecf3]">
                  {formatJalaliDateTime(detail.booking.flightInstance.departureAt)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mb-3 rounded-xl border border-[#22304a] bg-[#0f1726] p-3 text-[11px]">
            <div className="flex justify-between py-1">
              <span className="text-[#6b7b94]">مبلغ پرداخت‌شدهٔ بلیط</span>
              <span className="font-num font-bold text-[#e7ecf3]">
                {faMoney(detail.totalPaidIrr)} تومان
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[#6b7b94]">
                درصد جریمهٔ کنسلی (٪{faDigits(detail.penaltyPct)})
              </span>
              <span className="font-num font-bold text-[#f87171]">
                −{faMoney(detail.penaltyAmountIrr)} تومان
              </span>
            </div>
            <div className="flex justify-between border-t border-[#1f2a3d] pt-2">
              <span className="font-bold text-white">مبلغ نهایی قابل پرداخت</span>
              <span className="font-num font-black text-[#34d399]">
                {faMoney(detail.refundableIrr)} تومان
              </span>
            </div>
          </div>

          {detail.status === 'PAID' ? (
            <p className="rounded-lg bg-[#34d39924] p-3 text-center text-xs font-bold text-[#34d399]">
              پرداخت شد و پرونده بسته است ✓
            </p>
          ) : (
            <>
              <div className="mb-3 rounded-xl border border-[#22304a] bg-[#0f1726] p-3">
                <h3 className="mb-2 text-xs font-extrabold text-[#8fa1bb]">
                  {isSiteAdmin ? 'ارجاع به مدیر / کارمند مالی' : 'ارجاع به کارمند مالی'}
                </h3>
                <div className="flex gap-2">
                  <select
                    aria-label="گیرنده ارجاع"
                    value={assigneePick}
                    onChange={(e) => setAssigneePick(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-[#28344c] bg-[#18223a] px-2 text-xs text-[#e7ecf3] outline-none"
                  >
                    <option value="">— انتخاب —</option>
                    {referOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} — {s.roleLabelFa}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void onRefer()}
                    disabled={!assigneePick}
                    className="rounded-lg bg-[#3b82f6] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#2563eb] disabled:opacity-50"
                  >
                    ثبت و انتقال فرآیند ارجاع
                  </button>
                </div>
                {detail.assignee && (
                  <p className="mt-2 text-[11px] text-[#6b7b94]">ارجاع فعلی: {detail.assignee.fullName}</p>
                )}
              </div>
              {!isSiteAdmin && detail.status === 'FINANCE' ? (
                <button
                  type="button"
                  onClick={() => void onPay(detail.id)}
                  className="w-full rounded-lg bg-[#16a34a] py-2.5 text-xs font-bold text-white transition hover:bg-[#15803d]"
                >
                  تأیید، واریز به شبا و بستن پرونده
                </button>
              ) : isSiteAdmin ? null : (
                <p className="rounded-lg border border-[#28344c] bg-[#18223a] p-3 text-center text-[11px] text-[#8a97ab]">
                  در انتظار ادمین
                </p>
              )}
            </>
          )}
        </Modal>
      )}
      {stepUp.modal}
    </div>
  );
}
