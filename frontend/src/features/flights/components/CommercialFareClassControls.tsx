import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCommercialFlightControl,
  suggestFareClassPrice,
  updateAgencySalesVisibility,
  updateFareClassSitePrice,
  updateFlightSalesVisibility,
  upsertAgencyFareRelease,
} from "../../../api/flights";
import {
  faDigits,
  faMoney,
  irrToTomanInput,
  latinDigits,
  parseTomanToRialString,
} from "../../../lib/fa-format";
import type {
  CommercialFareClassControl,
  CommercialFlightControl,
  FareClassPriceSuggestion,
} from "../../../types/flights";

interface Props {
  instanceId: string;
  canManage: boolean;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

interface ChannelDraft {
  sitePrice: string;
  siteSeats: string;
  agencyPrice: string;
  agencySeats: string;
}

interface AssistantDraft {
  competitorPrice: string;
  result: FareClassPriceSuggestion | null;
}

const cabinLabels = {
  ECONOMY: "اکونومی",
  COMFORT: "کامفورت",
  BUSINESS: "بیزینس",
  FIRST: "فرست",
} as const;

function draftFor(row: CommercialFareClassControl): ChannelDraft {
  return {
    sitePrice: irrToTomanInput(row.sitePriceIrr ?? row.basePriceIrr),
    siteSeats: String(row.siteSeatsReleased),
    agencyPrice: irrToTomanInput(
      row.agencyReleasePriceIrr ?? row.sitePriceIrr ?? row.basePriceIrr,
    ),
    agencySeats: String(row.agencySeatsReleased),
  };
}

function rateDelta(newPriceIrr: string, basePriceIrr: string) {
  return BigInt(newPriceIrr) - BigInt(basePriceIrr);
}

function signedToman(deltaIrr: bigint) {
  const absolute = deltaIrr < 0n ? -deltaIrr : deltaIrr;
  const sign = deltaIrr > 0n ? "+" : deltaIrr < 0n ? "−" : "";
  return `${sign}${faMoney(absolute.toString())} تومان`;
}

function deltaClass(deltaIrr: bigint) {
  if (deltaIrr > 0n) return "text-[#16845e]";
  if (deltaIrr < 0n) return "text-[#dc4545]";
  return "text-panel-muted";
}

function ChannelStats({
  channel,
  capacity,
  released,
  sold,
  available,
  enabled,
}: {
  channel: "site" | "agency";
  capacity: number;
  released: number;
  sold: number;
  available: number;
  enabled: boolean;
}) {
  const registered = released > 0;
  const status = registered
    ? enabled
      ? "ثبت و منتشر شده"
      : "ثبت شده؛ کانال غیرفعال است"
    : "هنوز آزادسازی نشده";
  const color = channel === "agency" ? "#6d28d9" : "#2563b9";
  return (
    <div
      className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-5"
      data-testid={`${channel}-release-stats`}
    >
      {[
        ["ظرفیت کلاس", capacity],
        ["صندلی آزادشده", released],
        ["صندلی فروش‌رفته", sold],
        ["صندلی قابل‌فروش", available],
      ].map(([label, value]) => (
        <div
          key={String(label)}
          className="rounded-lg border border-[#dbe5f2] bg-[#f8fafc] px-3 py-2 text-center"
        >
          <div className="text-[9px] font-bold text-[#66758c]">{label}</div>
          <div className="mt-1 text-sm font-black" style={{ color }}>
            {faDigits(Number(value))}
          </div>
        </div>
      ))}
      <div className="col-span-2 rounded-lg border border-[#dbe5f2] bg-[#f8fafc] px-3 py-2 text-center lg:col-span-1">
        <div className="text-[9px] font-bold text-[#66758c]">وضعیت کلاس</div>
        <div className="mt-1 text-[10px] font-black" style={{ color }}>
          {status}
        </div>
      </div>
    </div>
  );
}

export default function CommercialFareClassControls({
  instanceId,
  canManage,
  onNotice,
  onError,
}: Props) {
  const [data, setData] = useState<CommercialFlightControl | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ChannelDraft>>({});
  const [assistantDrafts, setAssistantDrafts] = useState<
    Record<string, AssistantDraft>
  >({});
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const next = await fetchCommercialFlightControl(instanceId);
      setData(next);
      setDrafts((current) =>
        Object.fromEntries(
          next.fareClasses.map((row) => [
            row.ruleId,
            silent && current[row.ruleId] ? current[row.ruleId] : draftFor(row),
          ]),
        ),
      );
      setAssistantDrafts((current) =>
        Object.fromEntries(
          next.fareClasses.flatMap((row) =>
            (["AGENCY", "SYSTEM"] as const).map((channel) => {
              const key = `${channel}-${row.ruleId}`;
              return [
                key,
                current[key] ?? {
                  competitorPrice: irrToTomanInput(
                    next.competitorPriceIrr ?? row.sitePriceIrr ?? row.basePriceIrr,
                  ),
                  result: null,
                },
              ];
            }),
          ),
        ),
      );
      setOpenCards((current) =>
        Object.fromEntries(
          next.fareClasses.flatMap((row, index) =>
            (["agency", "site"] as const).map((channel) => {
              const key = `${channel}-${row.ruleId}`;
              return [key, current[key] ?? (index === 0)];
            }),
          ),
        ),
      );
    } catch (error) {
      setData(null);
      onError(
        error instanceof Error
          ? error.message
          : "خطا در دریافت کنترل فروش کلاس‌های نرخی.",
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, [instanceId, onError]);

  useEffect(() => {
    void load();
    const refreshTimer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(refreshTimer);
  }, [load]);

  const totalRevenueIrr = useMemo(
    () =>
      data?.fareClasses.reduce(
        (sum, row) => sum + BigInt(row.revenueIrr),
        0n,
      ) ?? 0n,
    [data],
  );

  function patchDraft(ruleId: string, patch: Partial<ChannelDraft>) {
    setDrafts((current) => ({
      ...current,
      [ruleId]: { ...current[ruleId], ...patch },
    }));
  }

  function patchAssistant(
    ruleId: string,
    channel: "SYSTEM" | "AGENCY",
    patch: Partial<AssistantDraft>,
  ) {
    const key = `${channel}-${ruleId}`;
    setAssistantDrafts((current) => ({
      ...current,
      [key]: {
        competitorPrice: current[key]?.competitorPrice ?? "",
        result: current[key]?.result ?? null,
        ...patch,
      },
    }));
  }

  function toggleCard(key: string) {
    setOpenCards((current) => ({ ...current, [key]: !current[key] }));
  }

  function closeCard(key: string) {
    setOpenCards((current) => ({ ...current, [key]: false }));
  }

  async function runPriceSuggestion(
    row: CommercialFareClassControl,
    channel: "SYSTEM" | "AGENCY",
  ) {
    const key = `${channel}-${row.ruleId}`;
    const competitorPriceIrr = parseTomanToRialString(
      assistantDrafts[key]?.competitorPrice ?? "",
    );
    if (!competitorPriceIrr || competitorPriceIrr === "0") {
      onError("برای تحلیل، نرخ معتبر رقبا را وارد کنید.");
      return;
    }
    setBusyKey(`ai-${key}`);
    try {
      const result = await suggestFareClassPrice(instanceId, row.ruleId, {
        channel,
        competitorPriceIrr,
      });
      patchAssistant(row.ruleId, channel, { result });
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "دستیار قیمت‌گذاری در دسترس نیست.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  function applySuggestedPrice(
    row: CommercialFareClassControl,
    channel: "SYSTEM" | "AGENCY",
  ) {
    const result = assistantDrafts[`${channel}-${row.ruleId}`]?.result;
    if (!result) return;
    patchDraft(
      row.ruleId,
      channel === "AGENCY"
        ? { agencyPrice: irrToTomanInput(result.suggestedPriceIrr) }
        : { sitePrice: irrToTomanInput(result.suggestedPriceIrr) },
    );
    onNotice(
      `نرخ پیشنهادی در باکس کلاس ${row.classCode} قرار گرفت؛ برای انتشار، دکمه ثبت و انتشار را بزنید.`,
    );
  }

  function renderPricingAssistant(
    row: CommercialFareClassControl,
    channel: "SYSTEM" | "AGENCY",
  ) {
    const key = `${channel}-${row.ruleId}`;
    const assistant = assistantDrafts[key] ?? {
      competitorPrice: "",
      result: null,
    };
    const isAgency = channel === "AGENCY";
    const accent = isAgency ? "#16845e" : "#2563b9";
    return (
      <div className="mt-3 rounded-xl border border-[#dbe5f2] bg-[#f8fafc] p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[180px] flex-1 text-[10px] font-bold text-[#66758c]">
            نرخ مشاهده‌شده رقبا (تومان)
            <input
              aria-label={`نرخ رقیب ${isAgency ? "آژانس" : "سایت"} کلاس ${row.classCode}`}
              value={assistant.competitorPrice}
              onChange={(event) =>
                patchAssistant(row.ruleId, channel, {
                  competitorPrice: event.target.value,
                  result: null,
                })
              }
              disabled={!canManage}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-[#cbd8e8] bg-white px-3 py-2 text-xs font-bold text-[#16233a] outline-none"
            />
          </label>
          <button
            type="button"
            disabled={!canManage || busyKey === `ai-${key}`}
            onClick={() => void runPriceSuggestion(row, channel)}
            className="rounded-lg border bg-white px-4 py-2 text-xs font-black disabled:opacity-50"
            style={{ borderColor: accent, color: accent }}
          >
            {busyKey === `ai-${key}` ? "در حال تحلیل…" : "تحلیل و پیشنهاد نرخ"}
          </button>
        </div>
        <p className="mt-2 text-[9px] text-[#66758c]">
          دستیار، ظرفیت و فروش کلاس، زمان مانده تا پرواز و نرخ رقبا را بررسی می‌کند؛ انتشار فقط با تأیید شما انجام می‌شود.
        </p>
        {assistant.result && (
          <div className="mt-3 rounded-lg border border-[#dbe5f2] bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[9px] font-bold text-[#66758c]">
                  پیشنهاد {assistant.result.source === "ML" ? "مدل هوش مصنوعی" : "مدل تحلیلی پشتیبان"}
                </span>
                <div className="mt-1 text-base font-black" style={{ color: accent }}>
                  {faMoney(assistant.result.suggestedPriceIrr)} تومان
                </div>
              </div>
              <button
                type="button"
                onClick={() => applySuggestedPrice(row, channel)}
                className="rounded-lg px-3 py-2 text-[10px] font-black text-white"
                style={{ backgroundColor: accent }}
              >
                اعمال در نرخ جدید
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[9px]">
              <div>اشغال کلاس: <strong>{faDigits(assistant.result.occupancyPct)}٪</strong></div>
              <div>تا پرواز: <strong>{faDigits(assistant.result.hoursToDeparture)} ساعت</strong></div>
              <div>موجودی مشترک: <strong>{faDigits(assistant.result.sharedSeatsRemaining)}</strong></div>
            </div>
            <p className="mt-2 text-[9px] leading-5 text-[#66758c]">
              {assistant.result.reasonFa}
            </p>
          </div>
        )}
      </div>
    );
  }

  async function toggleVisibility(enabled: boolean) {
    setBusyKey("visibility");
    try {
      await updateFlightSalesVisibility(instanceId, enabled);
      setData((current) =>
        current ? { ...current, publicSaleEnabled: enabled } : current,
      );
      onNotice(
        enabled
          ? "فروش این پرواز در سایت عمومی فعال شد."
          : "فروش این پرواز در سایت عمومی متوقف شد.",
      );
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "ثبت وضعیت فروش ناموفق بود.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleAgencyVisibility(enabled: boolean) {
    setBusyKey("agency-visibility");
    try {
      await updateAgencySalesVisibility(instanceId, enabled);
      setData((current) =>
        current ? { ...current, agencySaleEnabled: enabled } : current,
      );
      onNotice(
        enabled
          ? "فروش این پرواز برای آژانس‌ها فعال شد."
          : "فروش این پرواز برای آژانس‌ها متوقف شد.",
      );
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "ثبت وضعیت فروش آژانسی ناموفق بود.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function saveAgencyRelease(row: CommercialFareClassControl) {
    const draft = drafts[row.ruleId] ?? draftFor(row);
    const agencySeats = Number(latinDigits(draft.agencySeats));
    const agencyPriceIrr = parseTomanToRialString(draft.agencyPrice);

    if (
      !Number.isInteger(agencySeats) ||
      agencySeats <= 0 ||
      agencySeats < row.agencySoldSeats ||
      agencySeats > row.seatsAllocated
    ) {
      onError(
        `برای انتشار آژانسی حداقل یک صندلی وارد کنید؛ سقف کلاس ${faDigits(row.seatsAllocated)} صندلی است.`,
      );
      return;
    }
    if (!agencyPriceIrr || agencyPriceIrr === "0") {
      onError("قیمت معتبر آژانس را وارد کنید.");
      return;
    }

    setBusyKey(`agency-${row.ruleId}`);
    try {
      await upsertAgencyFareRelease(instanceId, row.ruleId, {
        seats: agencySeats,
        priceIrr: agencyPriceIrr,
        specialOffer: row.agencySpecialOffer,
      });
      if (!data?.agencySaleEnabled) {
        await updateAgencySalesVisibility(instanceId, true);
      }
      await load();
      closeCard(`agency-${row.ruleId}`);
      onNotice(`کلاس ${row.classCode} ثبت و برای آژانس‌ها منتشر شد.`);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "ثبت آزادسازی آژانسی ناموفق بود.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function saveSiteRelease(row: CommercialFareClassControl) {
    const draft = drafts[row.ruleId] ?? draftFor(row);
    const siteSeats = Number(latinDigits(draft.siteSeats));
    const sitePriceIrr = parseTomanToRialString(draft.sitePrice);
    const currentSitePriceIrr = row.sitePriceIrr ?? row.basePriceIrr;
    const priceChanged = sitePriceIrr !== currentSitePriceIrr;
    const reason = priceChanged
      ? "ثبت نرخ جدید در آزادسازی فروش سایت"
      : "";

    if (
      !Number.isInteger(siteSeats) ||
      siteSeats <= 0 ||
      siteSeats < row.siteSoldSeats ||
      siteSeats > row.seatsAllocated
    ) {
      onError(
        `برای انتشار در سایت حداقل یک صندلی وارد کنید؛ سقف کلاس ${faDigits(row.seatsAllocated)} صندلی است.`,
      );
      return;
    }
    if (!sitePriceIrr || sitePriceIrr === "0") {
      onError("قیمت معتبر سایت را وارد کنید.");
      return;
    }
    setBusyKey(`site-${row.ruleId}`);
    try {
      await updateFareClassSitePrice(instanceId, row.ruleId, {
        priceIrr: sitePriceIrr,
        reason,
        seats: siteSeats,
      });
      if (!data?.publicSaleEnabled) {
        await updateFlightSalesVisibility(instanceId, true);
      }
      await load();
      closeCard(`site-${row.ruleId}`);
      onNotice(`کلاس ${row.classCode} ثبت و در سایت منتشر شد.`);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "ثبت آزادسازی سایت ناموفق بود.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <div className="mt-3 text-xs text-panel-muted">
        در حال دریافت کنترل فروش…
      </div>
    );
  }
  if (!data) return null;

  return (
    <section
      className="mt-3 space-y-3"
      dir="rtl"
      data-testid="fare-class-channel-release"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-panel-border bg-panel-canvas p-3">
        <div>
          <h3 className="text-sm font-black text-panel-ink">
            آزادسازی صندلی و نرخ فروش
          </h3>
          <p className="mt-1 text-[10px] text-panel-muted">
            ظرفیت و قیمت سایت و آژانس مستقل است؛ موجودی قابل‌فروش هر دو از موتور
            رزرو مشترک محاسبه می‌شود.
          </p>
          <p className="mt-1 text-[9px] font-bold text-[#16845e]">
            موجودی مؤثر هر ۱۵ ثانیه به‌صورت خودکار به‌روزرسانی می‌شود.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-panel-border bg-panel-canvas p-2 text-xs text-panel-muted">
        درآمد ثبت‌شده کلاس‌ها:{" "}
        <strong className="text-accent">
          {faMoney(totalRevenueIrr.toString())} تومان
        </strong>
      </div>

      <>
          <section
            data-testid="agency-seat-release-panel"
            className="rounded-2xl border-2 border-[#8b5cf666] bg-[#f5f3ff] p-4 shadow-sm"
          >
            <button
              type="button"
              role="switch"
              aria-checked={data.agencySaleEnabled}
              aria-label={`فروش آژانسی: ${data.agencySaleEnabled ? "فعال" : "غیرفعال"}`}
              disabled={!canManage || busyKey === "agency-visibility"}
              onClick={() => void toggleAgencyVisibility(!data.agencySaleEnabled)}
              className="mb-4 flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8b5cf644] bg-white/70 px-3 py-3 text-right transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div>
                <h4 className="text-sm font-black text-[#6d28d9]">
                  آزادسازی مستقل برای آژانس‌ها
                </h4>
                <p className="mt-1 text-[10px] text-panel-muted">
                  فعال‌سازی، ظرفیت و قیمت این کانال هیچ وابستگی تنظیماتی به سایت ندارد.
                </p>
              </div>
              <span className="flex items-center gap-2 rounded-full border border-[#8b5cf633] bg-white px-3 py-2 text-xs font-black text-[#6d28d9] shadow-sm">
                <span className={`h-3 w-3 rounded-full ${data.agencySaleEnabled ? "bg-[#7c3aed]" : "bg-slate-300"}`} aria-hidden />
                فروش آژانسی: {data.agencySaleEnabled ? "فعال" : "غیرفعال"}
              </span>
            </button>
            <div className="space-y-3">
              {data.fareClasses.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#8b5cf666] bg-white p-5 text-center text-xs text-panel-muted">
                  برای این پرواز کلاس نرخی ثبت نشده است؛ نرخ و ظرفیت هر کلاس را در «ایجاد/ویرایش پرواز» تعریف کنید.
                </div>
              )}
              {data.fareClasses.map((row) => {
                const draft = drafts[row.ruleId] ?? draftFor(row);
                return (
                  <article
                    key={`agency-${row.ruleId}`}
                    className="overflow-hidden rounded-xl border border-[#8b5cf655] bg-white"
                  >
                    <button
                      type="button"
                      aria-expanded={Boolean(openCards[`agency-${row.ruleId}`])}
                      aria-controls={`agency-class-${row.ruleId}`}
                      onClick={() => toggleCard(`agency-${row.ruleId}`)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right"
                    >
                      <span>
                        <span className="block text-xs font-black text-[#16233a]">
                          {cabinLabels[row.cabin]} · کلاس {row.classCode}
                        </span>
                        <span className="mt-1 block text-[9px] font-bold text-[#6d28d9]">
                          {row.agencySeatsReleased > 0
                            ? `${faDigits(row.agencySeatsReleased)} آزادشده · ${faDigits(row.agencySoldSeats)} فروش‌رفته`
                            : "آزادسازی نشده"}
                        </span>
                      </span>
                      <span
                        className={`text-lg font-black text-[#6d28d9] transition-transform ${openCards[`agency-${row.ruleId}`] ? "rotate-180" : ""}`}
                        aria-hidden
                      >
                        ⌄
                      </span>
                    </button>
                    {openCards[`agency-${row.ruleId}`] && (
                    <div id={`agency-class-${row.ruleId}`} className="border-t border-[#8b5cf633] p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-black text-[#16233a]">
                          {cabinLabels[row.cabin]} · کلاس {row.classCode}
                        </div>
                        <div className="mt-1 text-[10px] text-[#66758c]">
                          موجودی مشترک موتور رزرو: {faDigits(row.sharedSeatsRemaining)} · فروش قطعی آژانس: {faDigits(row.agencySoldSeats)}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-bold">
                          <span className="rounded-md border border-[#dbe5f2] bg-white px-2 py-1 text-[#16233a]">
                            ظرفیت ثبت‌شده در ایجاد پرواز: {faDigits(row.seatsAllocated)} صندلی
                          </span>
                          <span className="rounded-md border border-[#dbe5f2] bg-white px-2 py-1 text-[#16233a]">
                            نرخ پایه ایجاد پرواز: {faMoney(row.basePriceIrr)} تومان
                          </span>
                          <span className="rounded-md bg-[#8b5cf614] px-2 py-1 text-[#6d28d9]">
                            نرخ فعلی آژانس: {row.agencyReleasePriceIrr ? `${faMoney(row.agencyReleasePriceIrr)} تومان` : "منتشر نشده"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                        <span className="rounded-full bg-[#8b5cf614] px-3 py-1 text-[#6d28d9]">
                          سقف آژانس: {faDigits(row.agencySeatsReleased)}
                        </span>
                        <span className="rounded-full bg-[#7c3aed] px-3 py-1 text-white">
                          قابل‌فروش: {faDigits(row.agencySeatsAvailable)}
                        </span>
                      </div>
                    </div>
                    <ChannelStats
                      channel="agency"
                      capacity={row.seatsAllocated}
                      released={row.agencySeatsReleased}
                      sold={row.agencySoldSeats}
                      available={row.agencySeatsAvailable}
                      enabled={data.agencySaleEnabled}
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-[10px] font-bold text-[#66758c]">
                        تعداد صندلی برای آزادسازی آژانس
                        <input
                          aria-label="ظرفیت فروش آژانس"
                          value={draft.agencySeats}
                          onChange={(event) =>
                            patchDraft(row.ruleId, { agencySeats: event.target.value })
                          }
                          disabled={!canManage}
                          inputMode="numeric"
                          className="mt-1 w-full rounded-lg border border-[#cbd8e8] bg-white px-3 py-2 text-xs font-bold text-[#16233a] outline-none focus:border-[#7c3aed] focus:ring-2 focus:ring-[#7c3aed22]"
                        />
                      </label>
                      <label className="text-[10px] font-bold text-[#66758c]">
                        نرخ جدید آژانس (تومان)
                        <input
                          aria-label="قیمت فروش آژانس"
                          value={draft.agencyPrice}
                          onChange={(event) =>
                            patchDraft(row.ruleId, { agencyPrice: event.target.value })
                          }
                          disabled={!canManage}
                          inputMode="numeric"
                          className="mt-1 w-full rounded-lg border border-[#cbd8e8] bg-white px-3 py-2 text-xs font-bold text-[#16233a] outline-none focus:border-[#7c3aed] focus:ring-2 focus:ring-[#7c3aed22]"
                        />
                      </label>
                    </div>
                    {renderPricingAssistant(row, "AGENCY")}
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        disabled={!canManage || busyKey === `agency-${row.ruleId}`}
                        onClick={() => void saveAgencyRelease(row)}
                        className="rounded-lg bg-[#7c3aed] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#6d28d9] disabled:opacity-50"
                      >
                        {busyKey === `agency-${row.ruleId}` ? "در حال ثبت…" : "تأیید، ثبت و انتشار برای آژانس"}
                      </button>
                    </div>
                    </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section
            data-testid="site-seat-release-panel"
            className="rounded-2xl border-2 border-[#3b82f666] bg-[#eff6ff] p-4 shadow-sm"
          >
            <button
              type="button"
              role="switch"
              aria-checked={data.publicSaleEnabled}
              aria-label={`فروش در سایت: ${data.publicSaleEnabled ? "فعال" : "غیرفعال"}`}
              disabled={!canManage || busyKey === "visibility"}
              onClick={() => void toggleVisibility(!data.publicSaleEnabled)}
              className="mb-4 flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-[#3b82f644] bg-white/70 px-3 py-3 text-right transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div>
                <h4 className="text-sm font-black text-[#2563b9]">
                  آزادسازی مستقل برای سایت
                </h4>
                <p className="mt-1 text-[10px] text-panel-muted">
                  فعال‌سازی، ظرفیت و قیمت فروش عمومی مستقل از کانال آژانس ثبت می‌شود.
                </p>
              </div>
              <span className="flex items-center gap-2 rounded-full border border-[#3b82f633] bg-white px-3 py-2 text-xs font-black text-[#2563b9] shadow-sm">
                <span className={`h-3 w-3 rounded-full ${data.publicSaleEnabled ? "bg-[#2563b9]" : "bg-slate-300"}`} aria-hidden />
                فروش در سایت: {data.publicSaleEnabled ? "فعال" : "غیرفعال"}
              </span>
            </button>
            <div className="space-y-3">
              {data.fareClasses.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#3b82f666] bg-white p-5 text-center text-xs text-panel-muted">
                  برای این پرواز کلاس نرخی ثبت نشده است؛ نرخ و ظرفیت هر کلاس را در «ایجاد/ویرایش پرواز» تعریف کنید.
                </div>
              )}
              {data.fareClasses.map((row) => {
                const draft = drafts[row.ruleId] ?? draftFor(row);
                return (
                  <article
                    key={`site-${row.ruleId}`}
                    className="overflow-hidden rounded-xl border border-[#3b82f655] bg-white"
                  >
                    <button
                      type="button"
                      aria-expanded={Boolean(openCards[`site-${row.ruleId}`])}
                      aria-controls={`site-class-${row.ruleId}`}
                      onClick={() => toggleCard(`site-${row.ruleId}`)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right"
                    >
                      <span>
                        <span className="block text-xs font-black text-[#16233a]">
                          {cabinLabels[row.cabin]} · کلاس {row.classCode}
                        </span>
                        <span className="mt-1 block text-[9px] font-bold text-[#2563b9]">
                          {row.siteSeatsReleased > 0
                            ? `${faDigits(row.siteSeatsReleased)} آزادشده · ${faDigits(row.siteSoldSeats)} فروش‌رفته`
                            : "آزادسازی نشده"}
                        </span>
                      </span>
                      <span
                        className={`text-lg font-black text-[#2563b9] transition-transform ${openCards[`site-${row.ruleId}`] ? "rotate-180" : ""}`}
                        aria-hidden
                      >
                        ⌄
                      </span>
                    </button>
                    {openCards[`site-${row.ruleId}`] && (
                    <div id={`site-class-${row.ruleId}`} className="border-t border-[#3b82f633] p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-black text-[#16233a]">
                          {cabinLabels[row.cabin]} · کلاس {row.classCode}
                        </div>
                        <div className="mt-1 text-[10px] text-[#66758c]">
                          موجودی مشترک موتور رزرو: {faDigits(row.sharedSeatsRemaining)} · فروش قطعی سایت: {faDigits(row.siteSoldSeats)}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-bold">
                          <span className="rounded-md border border-[#dbe5f2] bg-white px-2 py-1 text-[#16233a]">
                            ظرفیت ثبت‌شده در ایجاد پرواز: {faDigits(row.seatsAllocated)} صندلی
                          </span>
                          <span className="rounded-md border border-[#dbe5f2] bg-white px-2 py-1 text-[#16233a]">
                            نرخ پایه ایجاد پرواز: <strong data-testid={`base-price-${row.ruleId}`}>{faMoney(row.basePriceIrr)} تومان</strong>
                          </span>
                          <span className="rounded-md bg-[#3b82f614] px-2 py-1 text-[#2563b9]">
                            نرخ فعلی سایت: {faMoney(row.sitePriceIrr ?? row.basePriceIrr)} تومان
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                        <span className="rounded-full bg-[#3b82f614] px-3 py-1 text-[#2563b9]">
                          سقف سایت: {faDigits(row.siteSeatsReleased)}
                        </span>
                        <span className="rounded-full bg-[#2563b9] px-3 py-1 text-white">
                          قابل‌فروش: {faDigits(row.siteSeatsAvailable)}
                        </span>
                      </div>
                    </div>
                    <ChannelStats
                      channel="site"
                      capacity={row.seatsAllocated}
                      released={row.siteSeatsReleased}
                      sold={row.siteSoldSeats}
                      available={row.siteSeatsAvailable}
                      enabled={data.publicSaleEnabled}
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-[10px] font-bold text-[#66758c]">
                        تعداد صندلی برای آزادسازی سایت
                        <input
                          aria-label="ظرفیت فروش سایت"
                          value={draft.siteSeats}
                          onChange={(event) =>
                            patchDraft(row.ruleId, { siteSeats: event.target.value })
                          }
                          disabled={!canManage}
                          inputMode="numeric"
                          className="mt-1 w-full rounded-lg border border-[#cbd8e8] bg-white px-3 py-2 text-xs font-bold text-[#16233a] outline-none focus:border-[#2563b9] focus:ring-2 focus:ring-[#2563b922] disabled:opacity-50"
                        />
                      </label>
                      <label className="text-[10px] font-bold text-[#66758c]">
                        نرخ جدید سایت (تومان)
                        <input
                          aria-label="قیمت فروش سایت"
                          value={draft.sitePrice}
                          onChange={(event) =>
                            patchDraft(row.ruleId, { sitePrice: event.target.value })
                          }
                          disabled={!canManage}
                          inputMode="numeric"
                          className="mt-1 w-full rounded-lg border border-[#cbd8e8] bg-white px-3 py-2 text-xs font-bold text-[#16233a] outline-none focus:border-[#2563b9] focus:ring-2 focus:ring-[#2563b922] disabled:opacity-50"
                        />
                      </label>
                    </div>
                    {renderPricingAssistant(row, "SYSTEM")}
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        disabled={!canManage || busyKey === `site-${row.ruleId}`}
                        onClick={() => void saveSiteRelease(row)}
                        className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                      >
                        {busyKey === `site-${row.ruleId}` ? "در حال ثبت…" : "تأیید، ثبت و انتشار برای سایت"}
                      </button>
                    </div>
                    </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-panel-border bg-panel-canvas p-3">
            <h4 className="mb-2 text-xs font-black text-panel-ink">
              نرخ‌های ثبت‌شده و سود/زیان فروش
            </h4>
            <p className="mb-3 text-[10px] text-panel-muted">
              مبنای محاسبه، نرخ پایه‌ای است که هنگام ایجاد پرواز برای همان کلاس ثبت شده است.
            </p>
            <div className="space-y-2">
              {data.fareClasses.map((row) => (
                <details key={`history-${row.ruleId}`} className="rounded-lg border border-panel-border bg-panel-surface px-3 py-2 text-[10px] text-panel-muted">
                  <summary className="cursor-pointer font-bold text-panel-ink">
                    {cabinLabels[row.cabin]} · کلاس {row.classCode} · نرخ پایه {faMoney(row.basePriceIrr)} تومان
                  </summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {row.priceHistory.map((entry) => {
                      const delta = rateDelta(entry.newPriceIrr, row.basePriceIrr);
                      return (
                        <div key={`${entry.channel}-${entry.changedAt}-${entry.newPriceIrr}`} className="rounded-lg border border-panel-border bg-panel-canvas p-2">
                          <div className="font-bold text-panel-ink">
                            نرخ ثبت‌شده برای {entry.channel === "AGENCY" ? "آژانس" : "سایت"}: {faMoney(entry.newPriceIrr)} تومان
                          </div>
                          <div className={`mt-1 font-bold ${deltaClass(delta)}`}>
                            اختلاف هر بلیط با نرخ پایه: {signedToman(delta)}
                          </div>
                          {entry.reason && <div className="mt-1">دلیل: {entry.reason}</div>}
                        </div>
                      );
                    })}
                    {row.salesByRate?.map((sale) => {
                      const unitDelta = rateDelta(sale.priceIrr, row.basePriceIrr);
                      const realizedDelta = unitDelta * BigInt(sale.seats);
                      return (
                        <div key={`${sale.channel}-${sale.priceIrr}-${sale.lastSoldAt}`} className="rounded-lg border border-panel-border bg-panel-canvas p-2">
                          <div className="font-bold text-panel-ink">
                            فروش قطعی {sale.channel === "SYSTEM" ? "سایت" : sale.channel === "AGENCY" ? "آژانس" : sale.channel === "CHARTER" ? "چارتر" : "مدیریتی"} · {faMoney(sale.priceIrr)} تومان
                          </div>
                          <div className="mt-1">{faDigits(sale.seats)} صندلی · جمع فروش {faMoney(sale.revenueIrr)} تومان</div>
                          <div className={`mt-1 font-bold ${deltaClass(realizedDelta)}`}>
                            سود/زیان نسبت به نرخ پایه: {signedToman(realizedDelta)}
                          </div>
                        </div>
                      );
                    })}
                    {(row.salesByRate?.length ?? 0) === 0 && row.priceHistory.length === 0 && (
                      <div>هنوز سابقه‌ای ثبت نشده است.</div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </section>
      </>
    </section>
  );
}
