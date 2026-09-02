import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import {
  fetchCeoPricing,
  fetchCommercialPricing,
  fetchPendingApprovalsCount,
  approveProposal,
  rejectProposal,
  runAiAnalysis,
  setLegalRate,
  updatePublishedPrice,
  upsertProposal,
} from "../../api/pricing";
import { fetchAirports, submitFlightToOperations } from "../../api/flights";
import {
  faDigits,
  faMoney,
  irrPercentDelta,
  irrToTomanInput,
  parseTomanToRialString,
} from "../../lib/fa-format";
import { dayjs, formatJalaliDate } from "../../lib/jalali";
import { cabinLabel, formatDurationFa } from "../../lib/flight-definition";
import Modal from "../../components/Modal";
import ConfirmActionDialog from "../../components/ConfirmActionDialog";
import MoneyInput from "../../components/MoneyInput";
import { moneyInputToRialString } from "../../lib/money-input";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";
import { usePanelNotify } from "../../hooks/usePanelNotify";
import { ApiRequestError } from "../../api/envelope";
import { invalidateSearchResultsCache } from "../../lib/search-cache";
import type {
  CeoPricingResult,
  CommercialFlightRow,
  CommercialPricingResult,
  PricingProposal,
} from "../../types/pricing";
import type { AirportEntry } from "../../types/flights";
import type { OperationsFlightRow, OperationsFlightStatus } from "../../types/flights";
import FlightHistoryModal from "../operations/FlightHistoryModal";

/** Design hint-placeholder-count for commercial pricing rows = 5. */
/** Global panel list rule: 10 records per page. */
const COMMERCIAL_PRICING_PAGE_SIZE = 10;

function routeCodes(p: {
  flight: {
    flightNo?: string;
    route: { originCode: string; destCode: string };
  };
}) {
  return `${p.flight.route.originCode} ← ${p.flight.route.destCode}`;
}

/** @deprecated alias — CEO list still uses airport codes. */
function routeLabel(p: {
  flight: {
    flightNo?: string;
    route: { originCode: string; destCode: string };
  };
}) {
  return routeCodes(p);
}

function vsCompetitorLabel(
  proposed: string | number,
  competitor: string | number,
): string {
  const delta = irrPercentDelta(proposed, competitor);
  if (delta == null || Math.abs(delta) < 1) return "هم‌تراز رقبا";
  const pct = faDigits(Math.abs(Math.round(delta)));
  return delta < 0 ? `${pct}٪ پایین‌تر از رقبا` : `${pct}٪ بالاتر از رقبا`;
}

function moneyOrDash(irr: string | number | null | undefined): string {
  if (irr == null || irr === "") return "—";
  try {
    const n = BigInt(String(irr).replace(/[٬,\s]/g, ""));
    if (n <= 0n) return "—";
  } catch {
    return "—";
  }
  return `${faMoney(irr)} تومان`;
}

function formatDepartureTime(departureAt: string): string {
  return faDigits(dayjs(departureAt).calendar("jalali").format("HH:mm"));
}

function cabinCapacitiesLabel(
  rows: { cabin: string; seats: number }[] | undefined,
): string {
  if (!rows?.length) return "—";
  return rows
    .map(
      (c) =>
        `${cabinLabel(c.cabin as Parameters<typeof cabinLabel>[0])}: ${faDigits(c.seats)}`,
    )
    .join(" · ");
}

function PricingAccessDenied() {
  return (
    <div
      className="px-[21px] pb-[34px] pt-[18px]"
      data-testid="pricing-access-denied"
    >
      <p className="rounded-lg bg-[rgba(248,113,113,.12)] p-4 text-sm text-[#f87171]">
        دسترسی به این بخش مجاز نیست.
      </p>
    </div>
  );
}

/** CEO view — «تعیین قیمت بلیط». */
function CeoPricing() {
  const [data, setData] = useState<CeoPricingResult | null>(null);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<
    number | null
  >(null);
  const [airports, setAirports] = useState<AirportEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [legalInputs, setLegalInputs] = useState<Record<string, string>>({});
  const [factorsOpen, setFactorsOpen] = useState<Record<string, boolean>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmRegister, setConfirmRegister] = useState<{
    id: string;
    source: "PROPOSED" | "AI";
  } | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const { notify } = usePanelNotify();

  const cityByCode = useMemo(
    () => new Map(airports.map((a) => [a.code, a.cityFa])),
    [airports],
  );

  const persianRoute = useCallback(
    (originCode: string, destCode: string) => {
      const o = cityByCode.get(originCode) ?? originCode;
      const d = cityByCode.get(destCode) ?? destCode;
      return `${o} ← ${d}`;
    },
    [cityByCode],
  );

  const load = useCallback(async () => {
    try {
      setData(await fetchCeoPricing());
      fetchPendingApprovalsCount()
        .then((r) => setPendingApprovalsCount(r.pendingApprovalsCount))
        .catch(() => setPendingApprovalsCount(null));
    } catch {
      setError("خطا در دریافت پیشنهادهای قیمت.");
    }
  }, []);

  useEffect(() => {
    void load();
    fetchPendingApprovalsCount()
      .then((r) => setPendingApprovalsCount(r.pendingApprovalsCount))
      .catch(() => setPendingApprovalsCount(null));
    fetchAirports()
      .then(setAirports)
      .catch(() => setAirports([]));
  }, [load]);

  async function onRunAi() {
    setAiRunning(true);
    setError(null);
    setNotice(null);
    try {
      const result = await runAiAnalysis();
      if (!result.available) {
        setError(
          "سرویس تحلیل هوش مصنوعی در دسترس نیست؛ تأیید قیمت پیشنهادی همچنان ممکن است.",
        );
      } else {
        setNotice(
          "تحلیل کامل هوش مصنوعی (فصل، تعطیلات و رقبا) انجام و پیشنهاد قیمت ارائه شد ✓",
        );
      }
      await load();
    } catch {
      setError("خطا در اجرای تحلیل هوش مصنوعی.");
    } finally {
      setAiRunning(false);
    }
  }

  function onRegister(p: PricingProposal, source: "PROPOSED" | "AI") {
    setError(null);
    setConfirmRegister({ id: p.id, source });
  }

  async function confirmRegisterAction() {
    if (!confirmRegister) return;
    setActionBusy(true);
    setError(null);
    try {
      await approveProposal(confirmRegister.id, confirmRegister.source);
      setConfirmRegister(null);
      setNotice("قیمت پرواز تأیید و ثبت شد ✓");
      notify("قیمت پرواز تأیید و ثبت شد ✓", "success");
      invalidateSearchResultsCache();
      await load();
    } catch (e) {
      const msg =
        e instanceof ApiRequestError
          ? e.message
          : e instanceof Error
            ? e.message
            : "خطا در ثبت قیمت.";
      setError(msg);
      notify(msg, "error");
    } finally {
      setActionBusy(false);
    }
  }

  async function onSaveLegal(p: PricingProposal) {
    const rial = moneyInputToRialString(legalInputs[p.id] ?? "");
    if (rial === null) {
      setError("نرخ قانونی را وارد کنید");
      return;
    }
    try {
      await setLegalRate(p.id, rial);
      setNotice("نرخ قانونی (مصوب) ثبت شد ✓");
      setLegalInputs({ ...legalInputs, [p.id]: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در ثبت نرخ قانونی.");
    }
  }

  function onReject(_p: PricingProposal) {
    if (!rejectReason.trim()) {
      setError("دلیل رد درخواست را وارد کنید.");
      return;
    }
    setError(null);
    setConfirmReject(true);
  }

  async function confirmRejectAction() {
    if (!rejectingId || !rejectReason.trim()) return;
    setActionBusy(true);
    setError(null);
    try {
      await rejectProposal(rejectingId, {
        rejectionReason: rejectReason.trim(),
      });
      setConfirmReject(false);
      setRejectingId(null);
      setRejectReason("");
      setNotice("درخواست قیمت‌گذاری رد شد ✓");
      notify("درخواست قیمت‌گذاری رد شد ✓", "success");
      await load();
    } catch (e) {
      const msg =
        e instanceof ApiRequestError
          ? e.message
          : e instanceof Error
            ? e.message
            : "خطا در رد درخواست.";
      setError(msg);
      notify(msg, "error");
    } finally {
      setActionBusy(false);
    }
  }

  const pending = data?.pending ?? [];
  const registered = data?.registered ?? [];
  const pendingCount =
    pendingApprovalsCount ?? data?.pendingApprovalsCount ?? pending.length;
  const pendingPager = usePagination(pending);
  const registeredPager = usePagination(registered);

  function vsColor(
    proposed: string | number,
    competitor: string | number,
  ): string {
    const delta = irrPercentDelta(proposed, competitor);
    if (delta == null || Math.abs(delta) < 1) return "#9fb0c7";
    return delta < 0 ? "#34d399" : "#f87171";
  }

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-5">
        <h1 className="text-[20.5px] font-black text-white">تعیین قیمت بلیط</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">
          قیمت پیشنهادی مدیر بازرگانی، تحلیل هوش مصنوعی و تأیید نهایی مدیر عامل
          برای ثبت قیمت پرواز
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg bg-[rgba(16,185,129,.12)] p-3 text-sm text-[#34d399]">
          {notice}
        </p>
      )}

      <div className="mb-[15px] flex flex-wrap items-center justify-between gap-3.5 rounded-2xl border border-[#26324a] bg-gradient-to-br from-[#1a2740] to-[#141d2e] px-[18px] py-4">
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[rgba(59,130,246,.18)] text-[11px] font-extrabold text-[#60a5fa]">
              ۱
            </span>
            <span className="text-xs text-[#cdd9ec]">
              ۱ پیشنهاد مدیر بازرگانی
            </span>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#41506b"
            strokeWidth="2"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <div className="flex items-center gap-2">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[rgba(167,139,250,.18)] text-[11px] font-extrabold text-[#a78bfa]">
              ۲
            </span>
            <span className="text-xs text-[#cdd9ec]">۲ تحلیل هوش مصنوعی</span>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#41506b"
            strokeWidth="2"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <div className="flex items-center gap-2">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[rgba(16,185,129,.18)] text-[11px] font-extrabold text-[#34d399]">
              ۳
            </span>
            <span className="text-xs text-[#cdd9ec]">
              ۳ تأیید و ثبت مدیر عامل
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onRunAi()}
          disabled={aiRunning}
          className="inline-flex items-center gap-2 rounded-[11px] bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] px-[18px] py-[11px] text-xs font-extrabold text-white transition disabled:opacity-60"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4z" />
            <path d="M19 14l.8 2 .2.8-2-.8-.8.8" />
          </svg>
          {aiRunning
            ? "در حال تحلیل قیمت رقبا…"
            : "تحلیل و پیشنهاد قیمت هوش مصنوعی"}
        </button>
      </div>

      <div className="mb-3">
        <div className="mb-1.5 flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-[#a78bfa]" />
          <h2 className="m-0 text-sm font-extrabold text-white">
            پروازهای در انتظار تأیید نهایی
          </h2>
          <span className="font-num rounded-xl bg-[rgba(167,139,250,.16)] px-2.5 py-0.5 text-[11px] font-extrabold text-[#a78bfa]">
            {faDigits(pendingCount)}
          </span>
        </div>
        <p className="text-[11.5px] leading-6 text-[#8494ac]">
          پس از تأیید مدیرعامل، پرواز برای فروش فعال می‌شود.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] px-3 py-7 text-center text-xs text-[#6b7b94]">
          اطلاعاتی یافت نشد
        </div>
      ) : (
        <div className="mb-4 flex flex-col gap-2.5">
          {pendingPager.pageItems.map((p) => {
            const fi = p.flightInstance;
            const route = persianRoute(
              fi.flight.route.originCode,
              fi.flight.route.destCode,
            );
            const durationMin = p.durationMinutes ?? fi.durationMinutes;
            const aircraft = p.aircraftType ?? fi.aircraftType;
            const cabins = p.cabinCapacities ?? fi.cabinCapacities;
            const rejecting = rejectingId === p.id;

            return (
              <div
                key={p.id}
                className="rounded-[13px] border border-[#1f2a3d] bg-[#141d2e] px-[17px] py-[15px]"
              >
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-[200px] flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-[17px] font-black text-white">
                        {route}
                      </span>
                      <span className="ltr font-num rounded-[7px] bg-[#0f1726] px-2.5 py-0.5 text-[11.5px] font-bold text-[#9fb0c7]">
                        {fi.flight.flightNo}
                      </span>
                    </div>
                    <div className="font-num text-xs leading-6 text-[#8494ac]">
                      {formatJalaliDate(fi.departureAt)} · ساعت{" "}
                      {formatDepartureTime(fi.departureAt)}
                      {durationMin != null
                        ? ` · ${formatDurationFa(durationMin)}`
                        : ""}
                    </div>
                    {p.scheduleGroup && p.scheduleGroup.occurrenceCount > 1 && (
                      <div className="mt-2 rounded-lg border border-[#3b82f655] bg-[#3b82f612] p-2.5 text-[10.5px] leading-6 text-[#bfdbfe]">
                        تأیید این پیشنهاد، هر {faDigits(p.scheduleGroup.occurrenceCount)} پرواز با شماره یکسان را فعال می‌کند.
                        <div className="font-num text-[#93c5fd]">
                          از {p.scheduleGroup.startAt ? formatJalaliDate(p.scheduleGroup.startAt) : '—'} تا {p.scheduleGroup.endAt ? formatJalaliDate(p.scheduleGroup.endAt) : '—'}
                        </div>
                      </div>
                    )}
                    <div className="mt-1 text-[11px] leading-6 text-[#9fb0c7]">
                      {aircraft ? (
                        <span>
                          هواپیما:{" "}
                          <span className="font-bold text-[#cdd9ec]">
                            {aircraft}
                          </span>
                        </span>
                      ) : null}
                      {aircraft && cabins?.length ? " · " : null}
                      {cabins?.length ? (
                        <span>
                          کابین:{" "}
                          <span className="font-bold text-[#cdd9ec]">
                            {cabinCapacitiesLabel(cabins)}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    <div className="font-num mt-1 text-[11px] text-[#6b7b94]">
                      پیشنهاددهنده: {p.proposedBy.fullName}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex-none text-center">
                      <div className="mb-0.5 text-[11px] text-[#8494ac]">
                        قیمت پایه
                      </div>
                      <div className="font-num whitespace-nowrap text-[15px] font-extrabold text-[#93c5fd]">
                        {faMoney(p.basePriceIrr)} تومان
                      </div>
                    </div>
                    <div className="flex-none text-center">
                      <div className="mb-0.5 text-[11px] text-[#8494ac]">
                        رقبا
                      </div>
                      <div className="font-num whitespace-nowrap text-[15px] font-extrabold text-[#f59e0b]">
                        {faMoney(p.competitorPriceIrr)} تومان
                      </div>
                    </div>
                    <div className="flex-none text-center">
                      <div className="mb-0.5 text-[11px] text-[#8fb4f5]">
                        پیشنهاد بازرگانی
                      </div>
                      <div className="font-num whitespace-nowrap text-[15px] font-black text-white">
                        {faMoney(p.proposedPriceIrr)} تومان
                      </div>
                      <div
                        className="mt-0.5 text-[10.5px] font-bold"
                        style={{
                          color: vsColor(
                            p.proposedPriceIrr,
                            p.competitorPriceIrr,
                          ),
                        }}
                      >
                        {vsCompetitorLabel(
                          p.proposedPriceIrr,
                          p.competitorPriceIrr,
                        )}
                      </div>
                    </div>
                    {p.aiSuggestion && (
                      <div className="flex-none border-s border-[#24304a] ps-[15px] text-center">
                        <div className="mb-0.5 text-[11px] text-[#a78bfa]">
                          هوش مصنوعی
                        </div>
                        <div className="font-num whitespace-nowrap text-[15px] font-black text-[#c4b5fd]">
                          {faMoney(p.aiSuggestion.priceIrr)} تومان
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {(p.calculatedChargeBreakdown || p.chargeRules?.length) && (
                  <div className="mt-3 rounded-[11px] border border-[#1c2740] bg-[#0f1726] px-3.5 py-[11px] text-[11px]">
                    <div className="mb-1.5 font-bold text-[#cdd9ec]">
                      جمع قابل فروش (با عوارض)
                    </div>
                    {p.calculatedChargeBreakdown ? (
                      <>
                        <ul className="mb-1.5 flex flex-col gap-1 text-[#8494ac]">
                          {p.calculatedChargeBreakdown.lines.map((line, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span>{line.title}</span>
                              <span className="font-num font-bold text-[#e7ecf3]">
                                {faMoney(line.amountIrr)} تومان
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="font-num flex justify-between border-t border-[#24304a] pt-2 font-extrabold text-[#34d399]">
                          <span>جمع نهایی</span>
                          <span>
                            {faMoney(
                              p.calculatedChargeBreakdown.totalSellableIrr,
                            )}{" "}
                            تومان
                          </span>
                        </div>
                      </>
                    ) : (
                      <ul className="flex flex-col gap-1 text-[#8494ac]">
                        {p
                          .chargeRules!.filter((r) => r.active)
                          .map((rule, i) => (
                            <li key={i}>
                              {rule.title} (
                              {rule.kind === "TAX" ? "مالیات" : "عوارض"}) —{" "}
                              {rule.calculationMode === "FIXED"
                                ? `${faMoney(rule.fixedAmountIrr ?? 0)} تومان`
                                : `${faDigits((rule.percentageBasisPoints ?? 0) / 100)}٪`}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                )}

                {p.changeSummary && p.changeSummary.length > 0 && (
                  <div className="mt-3 rounded-[11px] border border-[rgba(245,158,11,.25)] bg-[rgba(245,158,11,.08)] px-3.5 py-[11px]">
                    <div className="mb-1.5 text-[11.5px] font-extrabold text-[#fcd34d]">
                      خلاصه تغییرات
                    </div>
                    <ul className="flex flex-col gap-1">
                      {p.changeSummary.map((line, i) => (
                        <li
                          key={i}
                          className="text-[11px] leading-6 text-[#dbe3f0]"
                        >
                          • {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {p.approvedSnapshot &&
                  p.changeSummary &&
                  p.changeSummary.length > 0 && (
                    <div className="mt-2 text-[10.5px] leading-6 text-[#6b7b94]">
                      نسخه تأییدشده قبلی: {p.approvedSnapshot.flightNo} ·{" "}
                      {formatJalaliDate(p.approvedSnapshot.departureAt)} · ظرفیت{" "}
                      {faDigits(p.approvedSnapshot.capacity)}
                    </div>
                  )}

                <div className="mt-[13px] flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onRegister(p, "PROPOSED")}
                    className="whitespace-nowrap rounded-[10px] bg-[#16a34a] px-[15px] py-2.5 text-[12.5px] font-extrabold text-white"
                  >
                    تأیید نهایی
                  </button>
                  {p.aiSuggestion && (
                    <button
                      type="button"
                      onClick={() => void onRegister(p, "AI")}
                      className="whitespace-nowrap rounded-[10px] border-[1.5px] border-[rgba(124,58,237,.5)] px-[15px] py-2.5 text-[12.5px] font-extrabold text-[#c4b5fd]"
                    >
                      ثبت با AI
                    </button>
                  )}
                  {!rejecting ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingId(p.id);
                        setRejectReason("");
                        setError(null);
                      }}
                      className="whitespace-nowrap rounded-[10px] border border-[rgba(248,113,113,.45)] px-[15px] py-2.5 text-[12.5px] font-extrabold text-[#f87171]"
                    >
                      رد درخواست
                    </button>
                  ) : null}
                </div>

                {rejecting && (
                  <div className="mt-3 rounded-[11px] border border-[rgba(248,113,113,.35)] bg-[rgba(248,113,113,.08)] px-3.5 py-3">
                    <label
                      className="mb-1.5 block text-[11.5px] font-bold text-[#fca5a5]"
                      htmlFor={`reject-${p.id}`}
                    >
                      دلیل رد درخواست (الزامی)
                    </label>
                    <textarea
                      id={`reject-${p.id}`}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      placeholder="دلیل رد را برای مدیر بازرگانی بنویسید…"
                      className="mb-2 w-full rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 py-2.5 text-[12.5px] leading-[1.8] text-[#e7ecf3] outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void onReject(p)}
                        className="rounded-[9px] bg-[#dc2626] px-[15px] py-2 text-xs font-extrabold text-white"
                      >
                        ثبت درخواست
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                        }}
                        className="rounded-[9px] border border-[#28344c] bg-[#18223a] px-[15px] py-2 text-xs font-bold text-[#9fb0c7]"
                      >
                        انصراف
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-[13px] flex flex-wrap items-end gap-3 rounded-[11px] border border-[#1c2740] bg-[#0f1726] px-3.5 py-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-[rgba(37,99,235,.16)] text-[#60a5fa]">
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M3 21h18M6 21V10M10 21V10M14 21V10M18 21V10M4 10h16L12 3z" />
                      </svg>
                    </span>
                    <span className="text-[12.5px] font-bold text-[#cdd9ec]">
                      نرخ قانونی (مصوب سازمان هواپیمایی)
                    </span>
                  </div>
                  <div className="flex min-w-[200px] flex-1 flex-wrap items-end gap-1.5">
                    <MoneyInput
                      id={`legal-${p.id}`}
                      aria-label="نرخ قانونی تومان"
                      valueToman={legalInputs[p.id] ?? ""}
                      onChangeToman={(v) =>
                        setLegalInputs({ ...legalInputs, [p.id]: v })
                      }
                      placeholder="مبلغ به تومان"
                      className="min-w-[140px] flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => void onSaveLegal(p)}
                      className="whitespace-nowrap rounded-[9px] bg-[#2563eb] px-[15px] py-2 text-xs font-extrabold text-white"
                    >
                      ثبت نرخ قانونی
                    </button>
                  </div>
                  <span className="font-num text-[11.5px] text-[#8494ac]">
                    ثبت‌شده:{" "}
                    <span className="font-extrabold text-[#93c5fd]">
                      {p.legalRateIrr
                        ? `${faMoney(p.legalRateIrr)} تومان`
                        : "—"}
                    </span>
                  </span>
                </div>

                {p.aiSuggestion ? (
                  <div className="mt-[13px] rounded-xl border border-[rgba(124,58,237,.32)] bg-[rgba(124,58,237,.08)] px-3.5 py-[13px]">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#a78bfa"
                        strokeWidth="2"
                      >
                        <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4z" />
                      </svg>
                      <span className="text-[13px] font-extrabold text-[#c4b5fd]">
                        تحلیل کامل هوش مصنوعی
                      </span>
                      <span className="rounded-xl bg-[rgba(59,130,246,.14)] px-2.5 py-0.5 text-[10.5px] font-bold text-[#93c5fd]">
                        فصل: {p.aiSuggestion.season}
                      </span>
                      <span className="rounded-xl bg-[rgba(202,165,58,.16)] px-2.5 py-0.5 text-[10.5px] font-bold text-[#fcd34d]">
                        مناسبت: {p.aiSuggestion.occasion}
                      </span>
                      <span className="font-num rounded-xl bg-[rgba(16,185,129,.14)] px-2.5 py-0.5 text-[10.5px] font-bold text-[#34d399]">
                        اطمینان:{" "}
                        {faDigits(Math.round(p.aiSuggestion.confidence * 100))}٪
                      </span>
                    </div>
                    <p className="text-[12.5px] leading-[2] text-[#dbe3f0]">
                      {p.aiSuggestion.reason}
                    </p>
                    {factorsOpen[p.id] && (
                      <div className="mt-[11px] flex flex-col gap-1.5 border-t border-[rgba(124,58,237,.25)] pt-[11px]">
                        {p.aiSuggestion.factors.map((f, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 text-xs leading-[1.8] text-[#aebbd0]"
                          >
                            <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-[#a78bfa]" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setFactorsOpen({
                          ...factorsOpen,
                          [p.id]: !factorsOpen[p.id],
                        })
                      }
                      className="mt-[11px] inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#c4b5fd]"
                    >
                      {factorsOpen[p.id]
                        ? "بستن جزئیات تحلیل"
                        : "مشاهدهٔ کامل عوامل تحلیل"}
                    </button>
                  </div>
                ) : (
                  (p.ceoNote ?? p.note) && (
                    <p className="mt-[11px] text-xs leading-[1.9] text-[#8494ac]">
                      یادداشت برای مدیرعامل: {p.ceoNote ?? p.note}
                    </p>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      <Pagination
        page={pendingPager.page}
        totalPages={pendingPager.totalPages}
        onChange={pendingPager.setPage}
        variant="dark"
      />

      {registered.length > 0 && (
        <section className="mt-1">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-[#34d399]" />
            <h2 className="m-0 text-sm font-extrabold text-white">
              قیمت‌های ثبت‌شده
            </h2>
            <span className="font-num rounded-xl bg-[rgba(16,185,129,.14)] px-2.5 py-0.5 text-[11px] font-extrabold text-[#34d399]">
              {faDigits(registered.length)}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {registeredPager.pageItems.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-[13px] border border-[#1f2a3d] bg-[#141d2e] px-[15px] py-[13px]"
              >
                <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-[rgba(16,185,129,.14)] text-[#34d399]">
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-extrabold text-white">
                      {routeLabel(p.flightInstance)}
                    </span>
                    <span className="ltr font-num text-[10px] text-[#6b7b94]">
                      {p.flightInstance.flight.flightNo} ·{" "}
                      {formatJalaliDate(p.flightInstance.departureAt)}
                    </span>
                    <span className="rounded-[10px] bg-[rgba(59,130,246,.14)] px-2 py-0.5 text-[9.5px] font-extrabold text-[#93c5fd]">
                      قفل‌شده
                    </span>
                  </div>
                  <div className="font-num mt-0.5 text-[10.5px] text-[#6b7b94]">
                    پیشنهاد بازرگانی: {faMoney(p.proposedPriceIrr)} تومان
                    {p.legalRateIrr
                      ? ` · نرخ قانونی: ${faMoney(p.legalRateIrr)} تومان`
                      : ""}
                  </div>
                </div>
                <div className="flex-none text-start">
                  <div className="text-[9.5px] text-[#6b7b94]">
                    قیمت ثبت‌شدهٔ پرواز
                  </div>
                  <div className="font-num text-sm font-black text-[#34d399]">
                    {faMoney(p.registeredPriceIrr ?? p.proposedPriceIrr)} تومان
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pagination
            page={registeredPager.page}
            totalPages={registeredPager.totalPages}
            onChange={registeredPager.setPage}
            variant="dark"
          />
        </section>
      )}
      <ConfirmActionDialog
        open={confirmRegister != null}
        title="تأیید قیمت پرواز"
        message="آیا از تأیید و ثبت نهایی این پیشنهاد قیمت مطمئن هستید؟"
        confirmLabel="تأیید نهایی"
        cancelLabel="انصراف"
        busy={actionBusy}
        busyLabel="در حال ثبت…"
        onCancel={() => setConfirmRegister(null)}
        onConfirm={confirmRegisterAction}
        variant="dark"
        tone="primary"
        testId="ceo-register-confirm"
      />
      <ConfirmActionDialog
        open={confirmReject}
        title="رد پیشنهاد قیمت"
        message="آیا از رد این پیشنهاد قیمت مطمئن هستید؟"
        confirmLabel="رد درخواست"
        cancelLabel="انصراف"
        busy={actionBusy}
        busyLabel="در حال رد…"
        onCancel={() => setConfirmReject(false)}
        onConfirm={confirmRejectAction}
        variant="dark"
        tone="danger"
        testId="ceo-reject-confirm"
      />
    </div>
  );
}

/** Commercial Manager view — pricing list + set-price modal (design v2 dark). */
function CommercialPricing({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<CommercialPricingResult | null>(null);
  const [airports, setAirports] = useState<AirportEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<CommercialFlightRow | null>(null);
  const [historyFlight, setHistoryFlight] = useState<OperationsFlightRow | null>(null);
  const [proposedInput, setProposedInput] = useState("");
  const [legalInput, setLegalInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [salePriceInput, setSalePriceInput] = useState("");
  const [priceChangeReason, setPriceChangeReason] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  const cityByCode = useMemo(
    () => new Map(airports.map((a) => [a.code, a.cityFa])),
    [airports],
  );

  const persianRoute = useCallback(
    (row: CommercialFlightRow) => {
      const o =
        cityByCode.get(row.flight.route.originCode) ??
        row.flight.route.originCode;
      const d =
        cityByCode.get(row.flight.route.destCode) ?? row.flight.route.destCode;
      return `${o} ← ${d}`;
    },
    [cityByCode],
  );

  const load = useCallback(async () => {
    try {
      setData(await fetchCommercialPricing());
    } catch {
      setError("خطا در دریافت فهرست قیمت‌گذاری.");
    }
  }, []);

  useEffect(() => {
    void load();
    fetchAirports()
      .then(setAirports)
      .catch(() => setAirports([]));
  }, [load]);

  function statusOf(row: CommercialFlightRow): {
    label: string;
    color: string;
    bg: string;
    btn: string;
    btnBg: string;
    btnColor: string;
    disabled: boolean;
  } {
    if (row.pricing?.status === "REGISTERED") {
      return {
        label: "منتشرشده — قابل مدیریت",
        color: "#34d399",
        bg: "rgba(16,185,129,.14)",
        btn: "مدیریت قیمت",
        btnBg: "#0f766e",
        btnColor: "#fff",
        disabled: false,
      };
    }
    if (row.definitionStatus === "PENDING_OPERATIONS") {
      return {
        label: "در انتظار بررسی مدیر عملیات",
        color: "#fbbf24",
        bg: "rgba(251,191,36,.14)",
        btn: "در انتظار بررسی",
        btnBg: "#18223a",
        btnColor: "#6b7b94",
        disabled: true,
      };
    }
    if (row.definitionStatus === "PENDING_CEO") {
      return {
        label: "در انتظار تأیید مدیر عامل",
        color: "#a78bfa",
        bg: "rgba(167,139,250,.16)",
        btn: "ارسال‌شده",
        btnBg: "#18223a",
        btnColor: "#6b7b94",
        disabled: true,
      };
    }
    if (row.pricing) {
      return {
        label:
          row.definitionStatus === "OPERATIONS_REJECTED"
            ? "نیاز به اصلاح — رد عملیات"
            : row.definitionStatus === "REJECTED"
              ? "نیاز به اصلاح — رد مدیر عامل"
              : "پیشنهاد ثبت‌شده",
        color: "#fb7185",
        bg: "rgba(251,113,133,.14)",
        btn: "اصلاح و ارسال مجدد",
        btnBg: "#3b82f6",
        btnColor: "#fff",
        disabled: false,
      };
    }
    return {
      label: "قیمت‌گذاری نشده",
      color: "#8494ac",
      bg: "rgba(130,145,168,.12)",
      btn: "تعیین قیمت",
      btnBg: "#3b82f6",
      btnColor: "#fff",
      disabled: false,
    };
  }

  function baseIrr(row: CommercialFlightRow): string | null {
    return row.pricing?.basePriceIrr ?? row.basePriceIrr;
  }

  function competitorIrr(row: CommercialFlightRow): string | null {
    return row.pricing?.competitorPriceIrr ?? row.competitorPriceIrr ?? null;
  }

  function openModal(row: CommercialFlightRow) {
    setSelected(row);
    setModalError(null);
    setSalePriceInput(
      irrToTomanInput(row.pricing?.registeredPriceIrr ?? row.pricing?.proposedPriceIrr),
    );
    setPriceChangeReason("");
    if (row.pricing && row.pricing.status !== "REGISTERED") {
      setProposedInput(irrToTomanInput(row.pricing.proposedPriceIrr));
      setLegalInput(irrToTomanInput(row.pricing.legalRateIrr));
      setNoteInput(row.pricing.note ?? "");
    } else {
      setProposedInput(irrToTomanInput(row.basePriceIrr));
      setLegalInput("");
      setNoteInput("");
    }
  }

  async function onSubmit() {
    if (!selected) return;
    const rial = parseTomanToRialString(proposedInput);
    if (rial === null) {
      setModalError("نرخ پیشنهادی را وارد کنید");
      return;
    }
    const legalRial = legalInput.trim()
      ? parseTomanToRialString(legalInput)
      : undefined;
    if (legalInput.trim() && legalRial === null) {
      setModalError("نرخ قانونی معتبر نیست.");
      return;
    }
    try {
      await upsertProposal(selected.id, {
        proposedPriceIrr: rial,
        legalRateIrr: legalRial ?? undefined,
        note: noteInput.trim() || undefined,
      });
      if (
        selected.definitionStatus === "DRAFT" ||
        selected.definitionStatus === "OPERATIONS_REJECTED" ||
        selected.definitionStatus === "REJECTED" ||
        selected.definitionStatus === "PENDING_REVISION"
      ) {
        await submitFlightToOperations(selected.id, selected.version);
      }
      setNotice("نرخ پیشنهادی برای بررسی مدیر عملیات ارسال شد ✓");
      setSelected(null);
      await load();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "خطا در ارسال پیشنهاد.");
    }
  }

  function openHistory(row: CommercialFlightRow) {
    const allowed = new Set<OperationsFlightStatus>([
      "PENDING_OPERATIONS",
      "OPERATIONS_REJECTED",
      "REJECTED",
      "PENDING_CEO",
      "PUBLISHED",
    ]);
    const rawStatus = row.definitionStatus as OperationsFlightStatus | undefined;
    const definitionStatus = rawStatus && allowed.has(rawStatus) ? rawStatus : "PUBLISHED";
    setHistoryFlight({
      id: row.id,
      flightNo: row.flight.flightNo,
      originCode: row.flight.route.originCode,
      destCode: row.flight.route.destCode,
      departureAt: row.departureAt,
      capacity: row.capacity,
      charterSeats: row.charterSeats,
      aircraftType: row.aircraftTypeOverride ?? row.flight.aircraftType ?? "—",
      basePriceIrr: row.basePriceIrr,
      competitorPriceIrr: row.competitorPriceIrr ?? null,
      proposal: row.pricing
        ? {
            id: row.pricing.id,
            proposedPriceIrr: row.pricing.proposedPriceIrr,
            legalRateIrr: row.pricing.legalRateIrr,
            note: row.pricing.note,
            status: row.pricing.status,
            proposedBy: row.pricing.proposedBy,
          }
        : null,
      definitionStatus,
      publishStatus: definitionStatus === "PUBLISHED" ? "PUBLISHED" : "NOT_PUBLISHED",
      uiStatus: definitionStatus,
      version: row.version ?? 1,
      rejectionReason: row.rejectionReason ?? null,
    });
  }

  async function onPublishedPriceUpdate() {
    if (!selected) return;
    const salePriceIrr = parseTomanToRialString(salePriceInput);
    if (!salePriceIrr) {
      setModalError("قیمت جدید را وارد کنید.");
      return;
    }
    if (priceChangeReason.trim().length < 2) {
      setModalError("دلیل تغییر قیمت را وارد کنید.");
      return;
    }
    setModalError(null);
    try {
      await updatePublishedPrice(selected.id, {
        salePriceIrr,
        reason: priceChangeReason.trim(),
        expectedVersion: selected.version,
      });
      setNotice("قیمت فروش پرواز به‌روزرسانی و در تاریخچه ثبت شد ✓");
      setSelected(null);
      await load();
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : "تغییر قیمت انجام نشد.");
    }
  }

  const flights = data?.flights ?? [];
  const flightsPager = usePagination(flights, COMMERCIAL_PRICING_PAGE_SIZE);
  const locked = selected?.pricing?.status === "REGISTERED";

  return (
    <div className={embedded ? "" : "px-[21px] pb-[34px] pt-[18px]"}>
      {!embedded && (
        <div className="mb-6">
          <h1 className="m-0 text-[20.5px] font-black text-white">
            تعیین قیمت پرواز و ارسال به گردش تأیید
          </h1>
          <p className="mt-1 text-[11.5px] text-[#6b7b94]">
            نرخ پیشنهادی را ثبت کنید؛ ابتدا مدیر عملیات و سپس مدیر عامل آن را بررسی می‌کنند.
          </p>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg bg-[rgba(52,211,153,.12)] p-3 text-sm text-[#34d399]">
          {notice}
        </p>
      )}

      <div className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
        {embedded && (
          <div className="border-b border-[#1f2a3d] px-[15px] py-[13px]">
            <h2 className="m-0 text-[14.5px] font-extrabold text-white">
              تعیین قیمت پرواز و ارسال به گردش تأیید
            </h2>
            <p className="mt-1 text-[11.5px] text-[#6b7b94]">
              پس از ثبت پیشنهاد، بررسی مدیر عملیات و تأیید نهایی مدیر عامل انجام می‌شود.
            </p>
          </div>
        )}

        {flights.length === 0 ? (
          <p className="px-[15px] py-[22px] text-center text-[11.5px] text-[#6b7b94]">
            پروازی برای قیمت‌گذاری ثبت نشده است.
          </p>
        ) : (
          <div className="flex flex-col">
            {flightsPager.pageItems.map((row) => {
              const st = statusOf(row);
              const base = baseIrr(row);
              const comp = competitorIrr(row);
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-[15px] border-b border-[#1a2436] px-[15px] py-[13px] last:border-b-0"
                >
                  <div className="min-w-[170px] flex-1">
                    <div className="mb-[3px] flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-extrabold text-[#e7ecf3]">
                        {persianRoute(row)}
                      </span>
                      <span
                        dir="ltr"
                        className="rounded-[7px] bg-[#0f1623] px-2 py-0.5 font-num text-[10px] font-bold text-[#9fb0c7]"
                      >
                        {row.flight.flightNo}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-[#6b7b94]">
                      تاریخ {formatJalaliDate(row.departureAt)} · پایه{" "}
                      {moneyOrDash(base)} · رقبا {moneyOrDash(comp)}
                    </div>
                  </div>

                  <div className="flex-none text-center">
                    <div className="mb-0.5 text-[9.5px] text-[#8494ac]">
                      نرخ پیشنهادی
                    </div>
                    <div className="whitespace-nowrap text-[12.5px] font-extrabold text-[#e7ecf3]">
                      {row.pricing
                        ? moneyOrDash(row.pricing.proposedPriceIrr)
                        : "—"}
                    </div>
                  </div>

                  <div className="flex-none text-center">
                    <div className="mb-0.5 text-[9.5px] text-[#60a5fa]">
                      نرخ قانونی
                    </div>
                    <div className="whitespace-nowrap text-[12.5px] font-extrabold text-[#93c5fd]">
                      {row.pricing?.legalRateIrr
                        ? moneyOrDash(row.pricing.legalRateIrr)
                        : "—"}
                    </div>
                  </div>

                  {row.pricing?.status === "REGISTERED" && (
                    <div className="flex-none text-center">
                      <div className="mb-0.5 text-[9.5px] text-[#34d399]">
                        قیمت قفل‌شده
                      </div>
                      <div className="whitespace-nowrap text-[12.5px] font-black text-[#34d399]">
                        {moneyOrDash(row.pricing.registeredPriceIrr)}
                      </div>
                    </div>
                  )}

                  <span
                    className="flex-none rounded-[14px] px-[11px] py-[5px] text-[10.5px] font-bold"
                    style={{ color: st.color, background: st.bg }}
                  >
                    {st.label}
                  </span>

                  <button
                    type="button"
                    onClick={() => openModal(row)}
                    disabled={st.disabled}
                    className="flex-none whitespace-nowrap rounded-[9px] px-[15px] py-[9px] text-[11.5px] font-extrabold disabled:cursor-default"
                    style={{ background: st.btnBg, color: st.btnColor }}
                  >
                    {st.btn}
                  </button>
                  <button
                    type="button"
                    onClick={() => openHistory(row)}
                    className="flex-none whitespace-nowrap rounded-[9px] border border-[#3b82f666] px-[12px] py-[9px] text-[10.5px] font-bold text-[#93c5fd]"
                  >
                    تاریخچه
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Pagination
        page={flightsPager.page}
        totalPages={flightsPager.totalPages}
        onChange={flightsPager.setPage}
        variant="dark"
      />

      {selected && (
        <Modal
          title={`تعیین قیمت پرواز — ${persianRoute(selected)}`}
          onClose={() => setSelected(null)}
        >
          <div className="mb-1 font-num text-[11px] text-[#6b7b94]" dir="ltr">
            {selected.flight.flightNo}
          </div>
          <div className="mb-3.5 grid grid-cols-2 gap-2.5">
            <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] px-[13px] py-[11px]">
              <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">
                قیمت پایهٔ شرکت
              </div>
              <div className="font-num text-[13.5px] font-extrabold text-[#cdd9ec]">
                {moneyOrDash(baseIrr(selected))}
              </div>
            </div>
            <div className="rounded-[11px] border border-[#22304a] bg-[#0f1623] px-[13px] py-[11px]">
              <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">
                قیمت رقبا
              </div>
              <div className="font-num text-[13.5px] font-extrabold text-[#f59e0b]">
                {moneyOrDash(competitorIrr(selected))}
              </div>
            </div>
          </div>

          <div
            className="mb-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2"
            data-testid="pricing-agency-capacity-summary"
          >
            <div className="rounded-[11px] border border-blue-400/20 bg-blue-400/5 px-[13px] py-[11px]">
              <div className="text-[10.5px] text-[#7f91aa]">
                مجموع صندلی فروخته‌شده به آژانس
              </div>
              <div className="font-num mt-1.5 text-[18px] font-black text-white">
                {faDigits(selected.agencySummary?.agencySeats ?? 0)} صندلی
              </div>
              <div className="font-num mt-1 text-[11px] text-blue-200">
                درآمد آژانس:{" "}
                {moneyOrDash(selected.agencySummary?.agencyRevenueIrr)}
              </div>
            </div>
            <div className="rounded-[11px] border border-emerald-400/20 bg-emerald-400/5 px-[13px] py-[11px]">
              <div className="text-[10.5px] text-[#7f91aa]">
                صندلی آزاد قابل فروش
              </div>
              <div className="font-num mt-1.5 text-[18px] font-black text-emerald-200">
                {faDigits(
                  selected.agencySummary?.freeSeats ??
                    Math.max(selected.capacity - selected.charterSeats, 0),
                )}{" "}
                صندلی
              </div>
              <div className="mt-1 text-[11px] text-[#7f91aa]">
                پس از کسر تعهد چارتری، تعهد آژانس و رزرو مستقیم
              </div>
            </div>
          </div>

          {selected.agencySummary?.agencies.length ? (
            <div className="mb-3.5 overflow-hidden rounded-[11px] border border-[#22304a] bg-[#0f1623]">
              <div className="border-b border-[#22304a] px-3 py-2 text-[10.5px] font-bold text-[#91a1b8]">
                جزئیات آژانس‌های متعهد
              </div>
              {selected.agencySummary.agencies.map((agency) => (
                <div
                  key={agency.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[#22304a] px-3 py-2 text-[11px] last:border-b-0"
                >
                  <span className="font-bold text-[#dbe6f5]">
                    {agency.agencyName}
                  </span>
                  <span className="font-num text-[#91a1b8]">
                    {faDigits(agency.seatsAllocated)} صندلی ·{" "}
                    {moneyOrDash(agency.revenueIrr)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {locked ? (
            <div>
              <div className="rounded-xl border border-[rgba(16,185,129,.4)] bg-[rgba(16,185,129,.09)] p-[15px] text-center">
                <p className="text-xs font-extrabold text-[#34d399]">قیمت جاری فروش</p>
                <p className="font-num mt-2 text-[22px] font-black text-white">{moneyOrDash(selected.pricing?.registeredPriceIrr)}</p>
                {selected.pricing?.legalRateIrr && <p className="font-num mt-1.5 text-[11px] text-[#8494ac]">سقف نرخ قانونی: {moneyOrDash(selected.pricing.legalRateIrr)}</p>}
              </div>
              <div className="mt-3 rounded-xl border border-blue-400/25 bg-blue-400/10 p-3 text-[11px] leading-6 text-blue-200">
                <strong className="block text-blue-300">راهنمای هوشمند مدیریت فروش</strong>
                {competitorIrr(selected)
                  ? `قیمت رقیب ${moneyOrDash(competitorIrr(selected))} است. اگر فروش پایین است، قیمت را به نرخ رقیب نزدیک کنید؛ همه تغییرات در تاریخچه ثبت می‌شوند.`
                  : "برای پروازهای کم‌فروش، کاهش مرحله‌ای قیمت و بررسی دوباره ضریب اشغال پیشنهاد می‌شود."}
              </div>
              <label className="mb-1.5 mt-3 block text-[11.5px] text-[#9fb0c7]" htmlFor="sale-price-input">قیمت جدید فروش (تومان)</label>
              <input id="sale-price-input" dir="ltr" value={salePriceInput} onChange={(event) => setSalePriceInput(event.target.value)} className="font-num h-11 w-full rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-right text-[13px] text-[#e7ecf3] outline-none" />
              <label className="mb-1.5 mt-3 block text-[11.5px] text-[#9fb0c7]" htmlFor="price-change-reason">دلیل تغییر قیمت</label>
              <textarea id="price-change-reason" value={priceChangeReason} onChange={(event) => setPriceChangeReason(event.target.value)} rows={2} placeholder="مثلاً: فروش پایین و کمتر از ۷۲ ساعت تا پرواز" className="w-full rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 py-2.5 text-[12.5px] leading-[1.8] text-[#e7ecf3] outline-none" />
              {modalError && <p role="alert" className="mt-2 text-xs text-[#f87171]">{modalError}</p>}
              <button type="button" onClick={() => void onPublishedPriceUpdate()} className="mt-4 h-[46px] w-full rounded-[11px] bg-[#0f766e] text-[13px] font-extrabold text-white">ثبت قیمت جدید</button>
            </div>
          ) : (
            <>
              {selected.pricing && (
                <p className="mb-[13px] flex items-center gap-[7px] rounded-[10px] border border-[rgba(167,139,250,.3)] bg-[rgba(167,139,250,.1)] px-3 py-[9px] text-[11px] text-[#c4b5fd]">
                  {selected.definitionStatus === "OPERATIONS_REJECTED" ||
                  selected.definitionStatus === "REJECTED"
                    ? "پیشنهاد رد شده است؛ اصلاحات را ثبت کنید تا دوباره برای مدیر عملیات ارسال شود."
                    : "پیشنهاد را تکمیل کنید؛ پس از ثبت برای بررسی مدیر عملیات ارسال می‌شود."}
                </p>
              )}
              <label
                className="mb-1.5 block text-[11.5px] text-[#9fb0c7]"
                htmlFor="proposed-input"
              >
                نرخ پیشنهادی (تومان)
              </label>
              <input
                id="proposed-input"
                dir="ltr"
                value={proposedInput}
                onChange={(e) => setProposedInput(e.target.value)}
                placeholder="مثلاً ۳۸۵۰۰۰۰"
                className="font-num h-11 w-full rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-right text-[13px] text-[#e7ecf3] outline-none"
              />
              <label
                className="mb-1.5 mt-3 block text-[11.5px] text-[#9fb0c7]"
                htmlFor="legal-input"
              >
                نرخ قانونی / مصوب سازمان هواپیمایی (تومان)
              </label>
              <input
                id="legal-input"
                dir="ltr"
                value={legalInput}
                onChange={(e) => setLegalInput(e.target.value)}
                placeholder="سقف نرخ مصوب"
                className="font-num h-11 w-full rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-right text-[13px] text-[#e7ecf3] outline-none"
              />
              <label
                className="mb-1.5 mt-3 block text-[11.5px] text-[#9fb0c7]"
                htmlFor="note-input"
              >
                یادداشت برای گردش تأیید (اختیاری)
              </label>
              <textarea
                id="note-input"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="توضیح دلیل قیمت پیشنهادی…"
                rows={2}
                className="w-full rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 py-2.5 text-[12.5px] leading-[1.8] text-[#e7ecf3] outline-none"
              />
              {modalError && (
                <p role="alert" className="mt-2 text-xs text-[#f87171]">
                  {modalError}
                </p>
              )}
              <button
                onClick={() => void onSubmit()}
                className="mt-4 flex h-[46px] w-full items-center justify-center gap-2 rounded-[11px] bg-[#3b82f6] text-[13px] font-extrabold text-white"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
                </svg>
                ارسال نرخ پیشنهادی برای بررسی مدیر عملیات
              </button>
            </>
          )}
        </Modal>
      )}
      {historyFlight && (
        <FlightHistoryModal
          flight={historyFlight}
          onClose={() => setHistoryFlight(null)}
        />
      )}
    </div>
  );
}

export default function PricingPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { user } = useAuth();
  if (user?.role === "COMMERCIAL_MANAGER" || user?.role === "EMPLOYEE") {
    return <CommercialPricing embedded={embedded} />;
  }
  if (user?.role === "CEO") {
    return <CeoPricing />;
  }
  return <PricingAccessDenied />;
}
