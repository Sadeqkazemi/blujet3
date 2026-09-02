import { faDigits, faMoney } from "../../../lib/fa-format";
import type { AllotmentSummary } from "../../../types/flights";

export default function AgencyAllotmentsSummaryCard({
  summary,
  loading = false,
}: {
  summary: AllotmentSummary | null;
  loading?: boolean;
}) {
  return (
    <section
      className="rounded-2xl border border-[#28344c] bg-[#0f1726] p-4"
      data-testid="agency-allotments-summary"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-extrabold text-white">
            تعهدات آژانس
          </h3>
          <p className="mt-1 text-[10.5px] leading-5 text-[#7f91aa]">
            این اطلاعات از فروش صندلی و قفل‌های سامانه رزرواسیون خوانده می‌شود و
            در این فرم قابل ورود دستی نیست.
          </p>
        </div>
        {summary && (
          <div className="rounded-lg bg-blue-500/10 px-3 py-2 text-[11px] text-blue-200">
            مجموع صندلی آژانس:{" "}
            <strong className="font-num text-white">
              {faDigits(summary.agencySeats)}
            </strong>
          </div>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-[11px] text-[#91a1b8]">در حال دریافت تعهدات…</p>
      ) : !summary ? (
        <p className="mt-4 rounded-xl border border-dashed border-[#33415b] px-3 py-4 text-center text-[11px] text-[#7f91aa]">
          برای مشاهده تعهدات، شماره پرواز ثبت‌شده را وارد کنید.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              ["ظرفیت کل", summary.totalCapacity],
              ["فروخته‌شده به آژانس", summary.agencySeats],
              ["رزرو مستقیم", summary.directReserved],
              ["صندلی آزاد", summary.freeSeats],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-[#243149] bg-[#131d2d] p-3"
              >
                <div className="text-[10px] text-[#7f91aa]">{label}</div>
                <div className="font-num mt-1 text-[17px] font-black text-white">
                  {faDigits(Number(value))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2.5 text-[11px] text-emerald-200">
            درآمد تعهدات آژانس:{" "}
            <strong className="font-num text-white">
              {faMoney(summary.agencyRevenueIrr)}
            </strong>
          </div>

          {summary.agencies.length > 0 ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-[#243149]">
              {summary.agencies.map((agency) => (
                <div
                  key={agency.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[#243149] px-3 py-2.5 text-[11px] last:border-b-0"
                >
                  <strong className="text-[#dbe6f5]">
                    {agency.agencyName}
                  </strong>
                  <span className="text-[#91a1b8]">
                    {faDigits(agency.seatsAllocated)} صندلی ·{" "}
                    <span className="font-num text-emerald-300">
                      {faMoney(agency.revenueIrr)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-[#7f91aa]">
              هنوز صندلی فعالی به آژانسی تخصیص داده نشده است.
            </p>
          )}
        </>
      )}
    </section>
  );
}
