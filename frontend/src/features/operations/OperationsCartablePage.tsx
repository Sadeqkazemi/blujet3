import { useEffect, useMemo, useState } from "react";
import {
  decideFlightOperations,
  fetchOperationsQueue,
} from "../../api/flights";
import { faDigits, faMoney } from "../../lib/fa-format";
import { formatJalaliDate } from "../../lib/jalali";
import type { OperationsFlightRow } from "../../types/flights";
import { operationsRouteLabel } from "./operations-ui";
import InternalCartableDashboard from "../cartable/InternalCartableDashboard";
import ComposeMessageModal from "../cartable/ComposeMessageModal";

export default function OperationsCartablePage() {
  const [rows, setRows] = useState<OperationsFlightRow[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);

  const load = () =>
    fetchOperationsQueue()
      .then(setRows)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "خطا در دریافت کارتابل."),
      );

  useEffect(() => {
    void load();
  }, []);

  async function decide(row: OperationsFlightRow, decision: "APPROVED" | "REJECTED") {
    const comment = (comments[row.id] ?? "").trim();
    if (!comment) {
      setError("ثبت نظر مدیر عملیات برای تأیید یا رد الزامی است.");
      return;
    }
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      await decideFlightOperations(row.id, {
        decision,
        comment,
        expectedVersion: row.version,
      });
      setRows((current) => current.filter((item) => item.id !== row.id));
      setNotice(decision === "APPROVED" ? "پرواز برای تأیید نهایی مدیر عامل ارسال شد." : "پرواز همراه با توضیحات به مدیر بازرگانی بازگردانده شد.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ثبت تصمیم انجام نشد.");
    } finally {
      setBusyId(null);
    }
  }

  const money = (value: string | null | undefined) =>
    value ? `${faMoney(value)} تومان` : "—";
  const normalizedQuery = query.trim().toLocaleLowerCase("fa");
  const filteredRows = useMemo(
    () =>
      normalizedQuery
        ? rows.filter((row) =>
            [
              row.flightNo,
              row.originCode,
              row.destCode,
              row.aircraftType,
              row.proposal?.proposedBy?.fullName,
              row.proposal?.note,
              row.proposal?.operationsNote,
            ]
              .filter(Boolean)
              .some((value) => String(value).toLocaleLowerCase("fa").includes(normalizedQuery)),
          )
        : rows,
    [normalizedQuery, rows],
  );

  return (
    <div className="p-6 md:p-8">
      <InternalCartableDashboard
        description="بررسی داخلی پرواز و پیشنهاد قیمت پیش از ارسال به مدیر عامل"
        query={query}
        onQueryChange={setQuery}
        cards={[
          { key: "pending", label: "در انتظار بررسی", count: rows.length, tone: "amber" },
          {
            key: "schedules",
            label: "برنامه‌های چندروزه",
            count: rows.filter((row) => (row.scheduleGroup?.occurrenceCount ?? 0) > 1).length,
            tone: "blue",
          },
          {
            key: "capacity",
            label: "ظرفیت کل",
            count: rows.reduce((sum, row) => sum + row.capacity, 0),
          },
          {
            key: "proposals",
            label: "پیشنهاد قیمت",
            count: rows.filter((row) => Boolean(row.proposal)).length,
            tone: "green",
          },
        ]}
      />
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={() => setComposeOpen(true)} className="rounded-xl bg-blue-500 px-5 py-3 text-xs font-black text-white">
          ＋ ایجاد پیام
        </button>
      </div>
      {composeOpen && (
        <ComposeMessageModal
          theme="dark"
          onClose={() => setComposeOpen(false)}
          onSent={(label) => setNotice(`پیام برای ${label} ارسال شد.`)}
        />
      )}
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-400/10 p-3 text-xs text-rose-300">{error}</p>}
      {notice && <p className="mt-4 rounded-xl bg-emerald-400/10 p-3 text-xs text-emerald-300">{notice}</p>}

      <div className="mt-5 space-y-5">
        {filteredRows.length === 0 && !error && <p className="rounded-2xl border border-[#24304a] bg-[#141d2e] p-8 text-center text-xs text-[#6b7b94]">{query.trim() ? "موردی با این جستجو یافت نشد." : "موردی در انتظار بررسی نیست."}</p>}
        {filteredRows.map((row) => (
          <article key={row.id} className="rounded-2xl border border-[#24304a] bg-[#141d2e] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-white">{operationsRouteLabel(row.originCode, row.destCode)}</h2>
                <p className="mt-1 text-[11px] text-[#8494ac]">{row.flightNo} · {formatJalaliDate(row.departureAt)}{row.proposal?.proposedBy ? ` · ${row.proposal.proposedBy.fullName}` : ""}</p>
              </div>
              <span className="rounded-full bg-amber-400/15 px-3 py-1 text-[10px] font-bold text-amber-300">در انتظار بررسی من</span>
            </div>

            {row.scheduleGroup && row.scheduleGroup.occurrenceCount > 1 && (
              <div className="mt-4 rounded-xl border border-blue-400/25 bg-blue-400/5 p-3">
                <p className="text-xs font-black text-blue-200">
                  این تصمیم برای هر {faDigits(row.scheduleGroup.occurrenceCount)} روز پرواز اعمال می‌شود
                </p>
                <p className="mt-1 text-[10px] text-[#9fb0c7]">
                  شروع {row.scheduleGroup.startAt ? formatJalaliDate(row.scheduleGroup.startAt) : '—'} · پایان {row.scheduleGroup.endAt ? formatJalaliDate(row.scheduleGroup.endAt) : '—'}
                </p>
                <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-auto">
                  {row.scheduleGroup.departures.map((departure) => (
                    <span key={departure} className="rounded-md bg-[#1d2b45] px-2 py-1 text-[10px] text-blue-100">
                      {formatJalaliDate(departure)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="هواپیما" value={row.aircraftType} />
              <Metric label="ظرفیت کل" value={faDigits(row.capacity)} />
              <Metric label="سهم چارتری" value={faDigits(row.charterSeats)} />
              <Metric label="ظرفیت آزاد" value={faDigits(Math.max(row.capacity - row.charterSeats, 0))} />
              <Metric label="قیمت پایه" value={money(row.basePriceIrr)} />
              <Metric label="قیمت رقبا" value={money(row.competitorPriceIrr)} />
              <Metric label="پیشنهاد بازرگانی" value={money(row.proposal?.proposedPriceIrr)} accent />
              <Metric label="نرخ قانونی" value={money(row.proposal?.legalRateIrr)} />
            </div>

            {(row.proposal?.operationsNote ?? row.proposal?.note) && <p className="mt-4 rounded-xl border border-blue-400/20 bg-blue-400/5 p-3 text-xs leading-7 text-blue-100">یادداشت برای مدیر عملیات: {row.proposal?.operationsNote ?? row.proposal?.note}</p>}
            <label className="mt-4 block text-xs font-bold text-[#9fb0c7]" htmlFor={`ops-comment-${row.id}`}>نظر / دلیل تصمیم</label>
            <textarea id={`ops-comment-${row.id}`} value={comments[row.id] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [row.id]: event.target.value }))} rows={3} placeholder="نظر یا دلیل تصمیم خود را بنویسید…" className="mt-2 w-full rounded-xl border border-[#2b3850] bg-[#0e1625] px-4 py-3 text-sm text-white outline-none focus:border-blue-400" />
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" disabled={busyId === row.id} onClick={() => void decide(row, "APPROVED")} className="rounded-xl bg-blue-500 px-5 py-3 text-xs font-black text-white disabled:opacity-50">تأیید و ارسال به مدیر عامل</button>
              <button type="button" disabled={busyId === row.id} onClick={() => void decide(row, "REJECTED")} className="rounded-xl border border-rose-400/50 bg-rose-400/10 px-5 py-3 text-xs font-black text-rose-300 disabled:opacity-50">رد و بازگشت به مدیر بازرگانی</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[#24304a] bg-[#0e1625] p-3">
      <div className="text-[10px] text-[#6b7b94]">{label}</div>
      <div className={`mt-1 text-xs font-extrabold ${accent ? "text-blue-300" : "text-[#dbe6f7]"}`}>{value}</div>
    </div>
  );
}
