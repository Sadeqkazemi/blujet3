import { useEffect, useMemo, useState } from 'react';
import { fetchFlightDetail, fetchFlightHistory } from '../../api/flights';
import { faDigits, faMoney } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import type { CompletedFlightRow, FlightDetail, FlightRow, FlightWorkflowHistory } from '../../types/flights';

type Summary = FlightRow | CompletedFlightRow;

type TimelineItem = {
  key: string;
  label: string;
  by: string;
  at: string;
  detail?: string;
  dot: string;
};

function auditDot(action: string, category: string): string {
  const text = `${action} ${category}`.toLowerCase();
  if (/reject|رد|reject/.test(text) || /REJECTED/i.test(action)) return '#f87171';
  if (/approv|تأیید|publish|ثبت|ok/.test(text)) return '#34d399';
  if (/propos|pricing|نرخ|submit|ارسال/.test(text)) return '#a78bfa';
  if (/creat|ایجاد/.test(text)) return '#60a5fa';
  return '#8494ac';
}

function roleLabel(role: string): string {
  if (role.includes('COMMERCIAL') || role.includes('بازرگانی')) return 'مدیر بازرگانی';
  if (role.includes('CEO') || role.includes('عامل')) return 'مدیر عامل';
  if (role.includes('OPERATIONS') || role.includes('عملیات') || role.includes('SENIOR')) return 'مدیر عملیات';
  return role || 'سامانه';
}

function buildTimeline(history: FlightWorkflowHistory): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const event of history.audit) {
    items.push({
      key: `a-${event.id}`,
      label: event.action,
      by: roleLabel(event.actorRole),
      at: event.createdAt,
      detail: event.detail || undefined,
      dot: auditDot(event.action, event.category),
    });
  }

  for (const review of history.reviews) {
    const ok = review.decision === 'APPROVED';
    items.push({
      key: `r-${review.id}`,
      label:
        review.stage === 'OPERATIONS'
          ? ok
            ? 'مدیر عملیات پیشنهاد را تأیید و برای مدیر عامل ارسال کرد'
            : 'مدیر عملیات این پیشنهاد را رد کرد'
          : ok
            ? 'مدیر عامل نرخ را تأیید و نهایی کرد'
            : 'مدیر عامل پیشنهاد را رد کرد',
      by: review.stage === 'OPERATIONS' ? 'مدیر عملیات' : 'مدیر عامل',
      at: review.reviewedAt,
      detail: review.comment || undefined,
      dot: ok ? '#34d399' : '#f87171',
    });
  }

  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return items;
}

export default function FlightLifecycleModal({ flight, onClose }: { flight: Summary; onClose: () => void }) {
  const [detail, setDetail] = useState<FlightDetail | null>(null);
  const [history, setHistory] = useState<FlightWorkflowHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchFlightDetail(flight.id), fetchFlightHistory(flight.id)])
      .then(([nextDetail, nextHistory]) => {
        setDetail(nextDetail);
        setHistory(nextHistory);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'خطا در دریافت تاریخچه پرواز.'),
      );
  }, [flight.id]);

  const timeline = useMemo(() => (history ? buildTimeline(history) : []), [history]);
  const completed = 'tickets' in flight ? flight : null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`تاریخچه پرواز ${flight.flightNo}`}
    >
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-[#2a3953] bg-[#101a2b] p-5 text-[#e7ecf3] shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black">
              جزئیات و تاریخچه پرواز <span className="ltr font-num">{flight.flightNo}</span>
            </h2>
            <p className="mt-1 text-xs text-[#8494ac]">
              {flight.originCode} ← {flight.destCode} · {formatJalaliDateTime(flight.departureAt)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-[#33415c] px-3 py-1.5 text-xs">
            بستن
          </button>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-400/10 p-3 text-xs text-rose-300">
            {error}
          </p>
        )}
        {!history && !error && (
          <p className="py-10 text-center text-xs text-[#8494ac]">در حال دریافت همه اطلاعات پرواز…</p>
        )}
        {history && detail && (
          <div className="space-y-5">
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Info label="هواپیما" value={detail.aircraftType || '—'} />
              <Info label="ظرفیت / فروش" value={`${faDigits(detail.capacity)} / ${faDigits(detail.sold)}`} />
              <Info label="ضریب اشغال" value={`${faDigits(detail.occupancyPct)}٪`} />
              <Info label="قیمت پایه" value={detail.basePriceIrr ? `${faMoney(detail.basePriceIrr)} تومان` : '—'} />
              {completed && (
                <>
                  <Info label="میانگین قیمت فروش" value={`${faMoney(completed.avgPriceIrr)} تومان`} />
                  <Info label="کل فروش" value={`${faMoney(completed.revenueIrr)} تومان`} />
                  <Info label="سود" value={`${faMoney(completed.profitIrr)} تومان`} />
                  <Info label="زیان" value={`${faMoney(completed.lossIrr)} تومان`} />
                </>
              )}
            </section>

            <section>
              <h3 className="mb-3 text-sm font-extrabold">خط زمانی گردش تأیید و رویدادها</h3>
              {timeline.length === 0 ? (
                <Empty text="رویدادی ثبت نشده است." />
              ) : (
                <ol className="relative mr-2 border-r border-[#2a3953] pr-5">
                  {timeline.map((item) => (
                    <li key={item.key} className="relative pb-5 last:pb-0">
                      <span
                        className="absolute -right-[27px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-[#101a2b]"
                        style={{ backgroundColor: item.dot }}
                        aria-hidden
                      />
                      <div className="rounded-xl border border-[#24304a] bg-[#0d1625] p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-xs font-bold leading-6 text-[#e7ecf3]">{item.label}</p>
                          <span className="font-num shrink-0 text-[10px] text-[#6b7b94]">
                            {formatJalaliDateTime(item.at)}
                          </span>
                        </div>
                        {item.by && (
                          <p className="mt-1 text-[10px] font-bold text-[#8494ac]">{item.by}</p>
                        )}
                        {item.detail && (
                          <p className="mt-1.5 text-xs leading-6 text-[#9fb0c7]">{item.detail}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#24304a] bg-[#0d1625] p-3">
      <div className="mb-1 text-[10px] text-[#6b7b94]">{label}</div>
      <div className="font-num text-xs font-bold text-[#dbe6f7]">{value}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-[#2d3a51] p-4 text-xs text-[#8494ac]">{text}</p>;
}
