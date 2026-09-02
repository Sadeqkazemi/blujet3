import { useEffect, useState } from "react";
import { fetchFlightHistory } from "../../api/flights";
import { faMoney } from "../../lib/fa-format";
import { formatJalaliDate } from "../../lib/jalali";
import type {
  FlightWorkflowHistory,
  OperationsFlightRow,
} from "../../types/flights";
import { OPERATIONS_STATUS_META, operationsRouteLabel } from "./operations-ui";

export default function FlightHistoryModal({
  flight,
  onClose,
}: {
  flight: OperationsFlightRow;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<FlightWorkflowHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFlightHistory(flight.id)
      .then(setHistory)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "خطا در دریافت تاریخچه."),
      );
  }, [flight.id]);

  const money = (value: string | null | undefined) =>
    value ? `${faMoney(value)} تومان` : "—";
  const status = OPERATIONS_STATUS_META[flight.definitionStatus];

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#28344c] bg-[#111a2a] p-5 text-[#e7ecf3] shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black">تاریخچه پرواز {flight.flightNo}</h2>
            <p className="mt-1 text-xs text-[#8494ac]">
              {operationsRouteLabel(flight.originCode, flight.destCode)} · {formatJalaliDate(flight.departureAt)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-[#33415c] px-3 py-1.5 text-xs text-[#9fb0c7]">بستن</button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Info label="هواپیما" value={flight.aircraftType} />
          <Info label="ظرفیت / چارتر" value={`${flight.capacity} / ${flight.charterSeats}`} />
          <Info label="قیمت پایه" value={money(flight.basePriceIrr)} />
          <Info label="قیمت پیشنهادی" value={money(flight.proposal?.proposedPriceIrr)} />
          <Info label="قیمت رقبا" value={money(flight.competitorPriceIrr)} />
          <Info label="نرخ قانونی" value={money(flight.proposal?.legalRateIrr)} />
          <Info label="نسخه" value={String(flight.version)} />
          <div className="rounded-xl border border-[#24304a] bg-[#0e1625] p-3">
            <div className="mb-1 text-[10px] text-[#6b7b94]">وضعیت</div>
            <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${status.className}`}>{status.label}</span>
          </div>
        </div>

        {flight.proposal && [
          ["یادداشت برای مدیرعامل", flight.proposal.ceoNote],
          ["یادداشت برای مدیر عملیات", flight.proposal.operationsNote],
          ["یادداشت داخلی بازرگانی", flight.proposal.commercialNote ?? flight.proposal.note],
        ].some(([, value]) => Boolean(value)) && (
          <section className="mb-4 space-y-3 rounded-xl border border-blue-400/20 bg-blue-400/5 p-4">
            {[
              ["یادداشت برای مدیرعامل", flight.proposal.ceoNote],
              ["یادداشت برای مدیر عملیات", flight.proposal.operationsNote],
              ["یادداشت داخلی بازرگانی", flight.proposal.commercialNote ?? flight.proposal.note],
            ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
              <div key={label}>
                <h3 className="mb-1 text-xs font-bold text-blue-300">{label}</h3>
                <p className="text-sm leading-7">{value}</p>
              </div>
            ))}
          </section>
        )}

        {error && <p className="rounded-lg bg-rose-400/10 p-3 text-xs text-rose-300">{error}</p>}
        {!history && !error && <p className="py-8 text-center text-xs text-[#8494ac]">در حال دریافت تاریخچه…</p>}

        {history && (
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-sm font-extrabold">نظر مدیران</h3>
              {history.reviews.length === 0 ? (
                <p className="rounded-xl border border-[#24304a] p-4 text-xs text-[#8494ac]">هنوز نظری ثبت نشده است.</p>
              ) : (
                <div className="space-y-2">
                  {history.reviews.map((review) => (
                    <article key={review.id} className="rounded-xl border border-[#24304a] bg-[#0e1625] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#8494ac]">
                        <span>{review.stage === "OPERATIONS" ? "مدیر عملیات" : "مدیر عامل"} · {review.decision === "APPROVED" ? "تأیید" : "رد"}</span>
                        <span>{formatJalaliDate(review.reviewedAt)}</span>
                      </div>
                      <p className="mt-2 text-sm leading-7">{review.comment}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-extrabold">رویدادهای پرواز و قیمت</h3>
              <div className="space-y-2">
                {history.audit.map((event) => (
                  <article key={event.id} className="rounded-xl border border-[#24304a] bg-[#0e1625] p-3">
                    <div className="flex flex-wrap justify-between gap-2 text-xs font-bold">
                      <span>{event.action}</span>
                      <span className="font-normal text-[#6b7b94]">{formatJalaliDate(event.createdAt)}</span>
                    </div>
                    {event.detail && <p className="mt-1 text-xs leading-6 text-[#9fb0c7]">{event.detail}</p>}
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#24304a] bg-[#0e1625] p-3">
      <div className="mb-1 text-[10px] text-[#6b7b94]">{label}</div>
      <div className="text-xs font-bold text-[#dbe6f7]">{value}</div>
    </div>
  );
}
