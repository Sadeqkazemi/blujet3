import { useCallback, useEffect, useState } from 'react';
import {
  fetchFlightCancellations,
  refundCancelledBooking,
} from '../../api/flight-cancellations';
import { useAuth } from '../../hooks/useAuth';
import { faDigits, faMoney } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import type { CancelledFlightRow } from '../../types/flight-cancellations';

export default function FlightCancellationsPage() {
  const { user } = useAuth();
  const isFinance = user?.role === 'FINANCE_MANAGER';
  const [rows, setRows] = useState<CancelledFlightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchFlightCancellations());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در دریافت پروازهای کنسل‌شده.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function refund(instanceId: string, bookingId: string) {
    setBusy(bookingId);
    setError(null);
    try {
      await refundCancelledBooking(instanceId, bookingId);
      setNotice('وجه رزرو به حساب مسافر بازگشت داده شد.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'استرداد وجه انجام نشد.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div dir="rtl" className="space-y-5 p-6 text-panel-ink">
      <header>
        <h1 className="text-2xl font-black text-panel-ink">کنسلی پرواز</h1>
        <p className="mt-1 text-sm text-[#91a0bd]">
          {isFinance
            ? 'فهرست مسافران پروازهای کنسل‌شده و بازگشت وجه به حساب'
            : 'پیگیری پروازهای کنسل‌شده و وضعیت استرداد مسافران'}
        </p>
      </header>
      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</div>}
      {loading ? (
        <div className="rounded-2xl border border-[#29354d] bg-[#151e31] p-8 text-center">در حال دریافت…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-[#29354d] bg-[#151e31] p-8 text-center text-[#91a0bd]">پرواز کنسل‌شده‌ای وجود ندارد.</div>
      ) : rows.map((row) => (
        <section key={row.id} className="rounded-2xl border border-panel-border bg-panel-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">{row.flightNo} · {row.originCode} ← {row.destCode}</h2>
              <p className="mt-1 text-xs text-[#91a0bd]">زمان پرواز: {formatJalaliDateTime(row.departureAt)}</p>
              <p className="mt-1 text-xs text-red-300">علت: {row.cancellationReason ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-panel-border bg-panel-canvas px-4 py-2 text-xs text-panel-ink">
              در انتظار استرداد: <b className="text-amber-300">{faDigits(row.refundSummary.pending)}</b>
              {' · '}پرداخت‌شده: <b className="text-emerald-300">{faDigits(row.refundSummary.refunded)}</b>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {row.bookings.length === 0 && <p className="text-sm text-[#91a0bd]">بلیط فروخته‌شده‌ای برای این پرواز ثبت نشده است.</p>}
            {row.bookings.map((booking) => (
              <div key={booking.id} className="grid gap-3 rounded-xl border border-panel-border bg-panel-canvas p-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-center">
                <div><span className="text-xs text-[#91a0bd]">مسافر</span><p className="font-bold">{booking.passengerNames.join('، ') || '—'}</p></div>
                <div><span className="text-xs text-[#91a0bd]">PNR</span><p className="font-bold">{booking.pnr}</p></div>
                <div className="font-black text-blue-300">{faMoney(booking.priceIrr)} تومان</div>
                {booking.status === 'REFUNDED' ? (
                  <span className="rounded-lg bg-emerald-500/15 px-3 py-2 text-center text-xs font-bold text-emerald-300">بازگشت داده شد</span>
                ) : isFinance ? (
                  <button type="button" disabled={busy === booking.id} onClick={() => void refund(row.id, booking.id)} className="rounded-lg bg-[#4f7ff0] px-4 py-2 text-xs font-black disabled:opacity-50">
                    {busy === booking.id ? 'در حال ثبت…' : 'بازگشت وجه'}
                  </button>
                ) : (
                  <span className="rounded-lg bg-amber-500/15 px-3 py-2 text-center text-xs font-bold text-amber-300">در انتظار مالی</span>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
