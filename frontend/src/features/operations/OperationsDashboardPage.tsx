import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchOperationsOverview } from "../../api/flights";
import { faDigits, faMoney } from "../../lib/fa-format";
import { formatJalaliDate } from "../../lib/jalali";
import type { OperationsOverview } from "../../types/flights";
import { operationsRouteLabel } from "./operations-ui";

export default function OperationsDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<OperationsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOperationsOverview()
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "خطا در دریافت داشبورد."),
      );
  }, []);

  const cards = data
    ? (() => {
        // Derive the KPI values from the same grouped rows rendered by this
        // dashboard. This keeps the UI honest even while an older backend
        // response is still cached and prevents a badge without a request.
        const rows = data.rows ?? [];
        const pendingOperations = data.pending?.length ?? rows.filter((row) => row.definitionStatus === "PENDING_OPERATIONS").length;
        const pendingCeo = rows.filter((row) => row.definitionStatus === "PENDING_CEO").length;
        const operationsRejected = rows.filter((row) => row.definitionStatus === "OPERATIONS_REJECTED" || row.definitionStatus === "REJECTED").length;
        const published = rows.filter((row) => row.definitionStatus === "PUBLISHED").length;
        return [
          ["در انتظار بررسی من", pendingOperations, "text-amber-300"],
          ["ارسال‌شده به مدیر عامل", pendingCeo, "text-blue-300"],
          ["رد شده — نزد بازرگانی", operationsRejected, "text-rose-300"],
          ["تأیید نهایی شده", published, "text-emerald-300"],
        ] as const;
      })()
    : [];

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-xl font-black text-white">داشبورد مدیر عملیات</h1>
      <p className="mt-1 text-xs text-[#6b7b94]">نمای کلی پیشنهادهای پرواز در جریان</p>
      {error && <p className="mt-4 rounded-xl bg-rose-400/10 p-3 text-xs text-rose-300">{error}</p>}

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, count, tone]) => (
          <div key={label} className="rounded-2xl border border-[#24304a] bg-[#141d2e] p-5">
            <div className="text-xs font-bold text-[#9fb0c7]">{label}</div>
            <div className={`mt-7 text-3xl font-black ${tone}`}>{faDigits(count)}</div>
          </div>
        ))}
      </div>

      <section className="mt-7 overflow-hidden rounded-2xl border border-[#24304a] bg-[#141d2e]">
        <div className="border-b border-[#24304a] px-5 py-4 text-sm font-extrabold text-white">آخرین موارد در انتظار بررسی</div>
        {!data && !error && <p className="p-6 text-xs text-[#6b7b94]">در حال بارگذاری…</p>}
        {data?.pending.length === 0 && <p className="p-6 text-xs text-[#6b7b94]">پروازی در انتظار بررسی نیست.</p>}
        {data?.pending.slice(0, 5).map((flight) => (
          <button key={flight.id} type="button" onClick={() => navigate("/panel/cartable")} className="flex w-full items-center justify-between gap-4 border-b border-[#1d283b] px-5 py-4 text-right last:border-b-0 hover:bg-[#172238]">
            <span>
              <strong className="text-sm text-white">{operationsRouteLabel(flight.originCode, flight.destCode)}</strong>
              <span className="mr-2 text-[10px] text-[#6b7b94]">{flight.flightNo}</span>
              <span className="mt-1 block text-[11px] text-[#8494ac]">{formatJalaliDate(flight.departureAt)} · پیشنهاد بازرگانی: {flight.proposal ? `${faMoney(flight.proposal.proposedPriceIrr)} تومان` : "—"}</span>
            </span>
            <span className="text-lg text-[#5f79a8]">‹</span>
          </button>
        ))}
      </section>
    </div>
  );
}
