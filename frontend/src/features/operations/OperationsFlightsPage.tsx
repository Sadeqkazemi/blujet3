import { useEffect, useMemo, useState } from "react";
import { fetchOperationsOverview } from "../../api/flights";
import { faMoney } from "../../lib/fa-format";
import { formatJalaliDate } from "../../lib/jalali";
import type {
  OperationsFlightRow,
  OperationsFlightStatus,
  OperationsOverview,
} from "../../types/flights";
import FlightHistoryModal from "./FlightHistoryModal";
import { OPERATIONS_STATUS_META, operationsRouteLabel } from "./operations-ui";

type Filter = "ALL" | OperationsFlightStatus;

export default function OperationsFlightsPage() {
  const [data, setData] = useState<OperationsOverview | null>(null);
  const [selected, setSelected] = useState<OperationsFlightRow | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOperationsOverview()
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "خطا در دریافت پروازها."),
      );
  }, []);

  const rows = useMemo(
    () => (data?.rows ?? []).filter((row) => filter === "ALL" || row.definitionStatus === filter),
    [data, filter],
  );

  const filters: { key: Filter; label: string }[] = [
    { key: "ALL", label: "همه" },
    { key: "PENDING_OPERATIONS", label: "در انتظار من" },
    { key: "PENDING_CEO", label: "نزد مدیر عامل" },
    { key: "OPERATIONS_REJECTED", label: "رد عملیات" },
    { key: "REJECTED", label: "رد مدیر عامل" },
    { key: "PUBLISHED", label: "منتشرشده" },
  ];

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-xl font-black text-white">مدیریت پرواز</h1>
      <p className="mt-1 text-xs text-[#6b7b94]">وضعیت و تاریخچه کامل گردش تأیید پروازها</p>
      {error && <p className="mt-4 rounded-xl bg-rose-400/10 p-3 text-xs text-rose-300">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={`rounded-lg px-3 py-2 text-[11px] font-bold ${filter === item.key ? "bg-blue-500 text-white" : "border border-[#2b3850] text-[#9fb0c7]"}`}>{item.label}</button>
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-[#24304a] bg-[#141d2e]">
        <div className="hidden grid-cols-[1.5fr_.9fr_1fr_1fr_1fr] gap-3 border-b border-[#24304a] px-5 py-3 text-[10px] text-[#6b7b94] md:grid">
          <span>مسیر / شماره پرواز</span><span>تاریخ</span><span>پیشنهاد بازرگانی</span><span>وضعیت</span><span>تاریخچه</span>
        </div>
        {rows.length === 0 && <p className="p-8 text-center text-xs text-[#6b7b94]">پروازی در این وضعیت وجود ندارد.</p>}
        {rows.map((row) => {
          const status = OPERATIONS_STATUS_META[row.definitionStatus];
          return (
            <div key={row.id} className="grid gap-3 border-b border-[#1d283b] px-5 py-4 last:border-b-0 md:grid-cols-[1.5fr_.9fr_1fr_1fr_1fr] md:items-center">
              <div><strong className="block text-sm text-white">{operationsRouteLabel(row.originCode, row.destCode)}</strong><span className="text-[10px] text-[#6b7b94]">{row.flightNo}</span></div>
              <span className="text-xs text-[#9fb0c7]">{formatJalaliDate(row.departureAt)}</span>
              <span className="text-xs font-bold text-[#dbe6f7]">{row.proposal ? `${faMoney(row.proposal.proposedPriceIrr)} تومان` : "—"}</span>
              <span><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${status.className}`}>{status.label}</span></span>
              <button type="button" onClick={() => setSelected(row)} className="justify-self-start rounded-lg border border-blue-400/40 px-3 py-2 text-[10px] font-bold text-blue-300">مشاهده جزئیات و نظرات</button>
            </div>
          );
        })}
      </div>
      {selected && <FlightHistoryModal flight={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
