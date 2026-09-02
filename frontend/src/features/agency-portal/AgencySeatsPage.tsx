// صندلی‌های تخصیص‌یافته — real per-flight allotments (Phase 16), replacing
// the earlier mock/sample data with GET /agency-portal/allotments. The
// info banner and Allocated/Sold/Remaining labels reuse
// design-reference-v2/پنل آژانس.dc.html's own isEN vocabulary for this
// exact tab (seatsInfoBanner, allocatedLabel, soldLabel, remainingLabel);
// AR has no counterpart there and is hand-translated.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createAllotmentBooking,
  fetchAllotments,
  fetchCredit,
  fetchMySeatRequests,
  fetchSeatRequestOptions,
  inquireAgencySeats,
  requestAgencySeats,
} from "../../api/agency-portal";
import { fetchSeatMap } from "../../api/publicSite";
import { publicCabinLabel } from "../../lib/flight-definition";
import { localeMoney } from "../../lib/fa-format";
import { formatLocaleDateTime, localeDigits } from "../../lib/locale-format";
import { useLocale, type StoredLocale } from "../../hooks/useLocale";
import type {
  AgencyAllotmentRow,
  AgencyCredit,
} from "../../types/agency-portal";
import type { AgencySeatRequestOption } from "../../types/agency-portal";
import type { AgencySeatRequestHistoryRow } from "../../types/agency-portal";
import type { AgencySeatInquiry } from "../../types/agency-portal";
import { airportCityLabel } from "../../lib/airport-cities";
import type { CabinClass, SeatMapResult } from "../../types/public-site";

const STR: Record<
  StoredLocale,
  {
    infoBanner: string;
    errorFallback: string;
    empty: string;
    activeBadge: string;
    releasedBadge: string;
    allocatedLabel: string;
    soldLabel: string;
    remainingLabel: string;
    sell: string;
    passengerName: string;
    nationalId: string;
    mobile: string;
    cabin: string;
    seat: string;
    issue: string;
    cancel: string;
  }
> = {
  fa: {
    infoBanner:
      "در تب پروازهای فعال همه پروازهای منتشرشده‌ای که صندلی قابل فروش دارند نمایش داده می‌شوند. سهمیه‌های تأیید و پرداخت‌شده مستقیماً قابل فروش‌اند و برای سایر ردیف‌ها می‌توانید درخواست تخصیص صندلی ثبت کنید.",
    errorFallback: "خطا در دریافت سهمیه‌های صندلی.",
    empty: "در حال حاضر سهمیه پرداخت‌شده و فعال برای فروش وجود ندارد.",
    activeBadge: "فعال",
    releasedBadge: "آزادشده",
    allocatedLabel: "تخصیص‌یافته",
    soldLabel: "فروخته",
    remainingLabel: "باقی‌مانده",
    sell: "ثبت فروش",
    passengerName: "نام و نام خانوادگی مسافر",
    nationalId: "کد ملی",
    mobile: "شماره موبایل",
    cabin: "کلاس پروازی",
    seat: "صندلی",
    issue: "صدور قطعی بلیت",
    cancel: "انصراف",
  },
  en: {
    infoBanner:
      "Active Flights shows every published flight with sellable inventory. Paid approved allotments can be sold immediately; use the allocation request action for the other rows.",
    errorFallback: "Error loading seat allotments.",
    empty: "There are currently no paid active allotments available for sale.",
    activeBadge: "Active",
    releasedBadge: "Released",
    allocatedLabel: "Allocated",
    soldLabel: "Sold",
    remainingLabel: "Remaining",
    sell: "Sell ticket",
    passengerName: "Passenger full name",
    nationalId: "National ID",
    mobile: "Mobile",
    cabin: "Cabin",
    seat: "Seat",
    issue: "Issue ticket",
    cancel: "Cancel",
  },
  ar: {
    infoBanner:
      "تعرض الرحلات النشطة كل رحلة منشورة فيها مقاعد قابلة للبيع. يمكن بيع الحصص المعتمدة والمدفوعة مباشرة، وللصفوف الأخرى يمكن إرسال طلب تخصيص مقاعد.",
    errorFallback: "خطأ في تحميل حصص المقاعد.",
    empty: "لا توجد حاليًا حصص مدفوعة ونشطة متاحة للبيع.",
    activeBadge: "نشط",
    releasedBadge: "مُحرَّر",
    allocatedLabel: "مخصَّص",
    soldLabel: "مباع",
    remainingLabel: "متبقٍ",
    sell: "تسجيل البيع",
    passengerName: "اسم المسافر الكامل",
    nationalId: "رقم الهوية",
    mobile: "رقم الجوال",
    cabin: "الدرجة",
    seat: "المقعد",
    issue: "إصدار التذكرة",
    cancel: "إلغاء",
  },
};

export default function AgencySeatsPage() {
  const { locale } = useLocale();
  const t = STR[locale];
  const [rows, setRows] = useState<AgencyAllotmentRow[] | null>(null);
  const [requestOptions, setRequestOptions] = useState<
    AgencySeatRequestOption[] | null
  >(null);
  const [requestHistory, setRequestHistory] = useState<
    AgencySeatRequestHistoryRow[]
  >([]);
  const [agencyCredit, setAgencyCredit] = useState<AgencyCredit | null>(null);
  const [activeView, setActiveView] = useState<
    "routes" | "requested" | "invoices" | "active" | "rejected"
  >("routes");
  const [originCode, setOriginCode] = useState("");
  const [destCode, setDestCode] = useState("");
  const [requestFlightId, setRequestFlightId] = useState("");
  const [requestedSeats, setRequestedSeats] = useState(0);
  const [seatInquiryState, setSeatInquiryState] = useState<
    "idle" | "ready" | "confirmed"
  >("idle");
  const [seatInquiry, setSeatInquiry] = useState<AgencySeatInquiry | null>(
    null,
  );
  const [seatInquiryLoading, setSeatInquiryLoading] = useState(false);
  const [seatInquiryError, setSeatInquiryError] = useState<string | null>(null);
  const [seatInquiryNonce, setSeatInquiryNonce] = useState(0);
  const [preferredWeekdays, setPreferredWeekdays] = useState<number[]>([]);
  const [termMonths, setTermMonths] = useState<0 | 1 | 3 | 6 | 12>(3);
  const [payMethod, setPayMethod] = useState<"INVOICE" | "CREDIT">("INVOICE");
  const [selectedOccurrenceIds, setSelectedOccurrenceIds] = useState<string[]>(
    [],
  );
  const [selectedMonthKeys, setSelectedMonthKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [allotmentsLoading, setAllotmentsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seatMap, setSeatMap] = useState<SeatMapResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    nationalId: "",
    mobile: "",
    cabin: "ECONOMY" as CabinClass,
    seatCode: "",
  });

  const loadAllotments = useCallback(async () => {
    setAllotmentsLoading(true);
    try {
      const nextRows = await fetchAllotments();
      setRows(nextRows);
      setError(null);
    } catch {
      // Preserve already-rendered flights on a transient refresh/network
      // failure.  Replacing them with [] made the UI claim that purchased
      // capacity had disappeared even though only the request had failed.
      setError(t.errorFallback);
    } finally {
      setAllotmentsLoading(false);
    }
  }, [t.errorFallback]);

  async function reload() {
    await loadAllotments();
  }

  useEffect(() => {
    // Route choices and existing allotments are independent resources. A
    // failure in the history endpoint must not blank the commercial routes.
    void loadAllotments();
    void fetchSeatRequestOptions()
      .then(setRequestOptions)
      .catch(() => {
        setRequestOptions([]);
        setError(t.errorFallback);
      });
    void fetchMySeatRequests()
      .then(setRequestHistory)
      .catch(() => setRequestHistory([]));
    void fetchCredit()
      .then(setAgencyCredit)
      .catch(() => setAgencyCredit(null));
  }, [loadAllotments, t.errorFallback]);

  useEffect(() => {
    const refreshLiveAllotments = () => void loadAllotments();
    window.addEventListener("pageshow", refreshLiveAllotments);
    return () => window.removeEventListener("pageshow", refreshLiveAllotments);
  }, [loadAllotments]);

  const origins = Array.from(
    new Set((requestOptions ?? []).map((row) => row.originCode)),
  );
  const destinations = Array.from(
    new Set(
      (requestOptions ?? [])
        .filter((row) => !originCode || row.originCode === originCode)
        .map((row) => row.destCode),
    ),
  );
  const optionKey = (option: AgencySeatRequestOption) =>
    `${option.flightInstanceId}:${option.cabin}:${option.fareClassCode}`;
  const routeGroups = useMemo(() => {
    const groups = new Map<string, AgencySeatRequestOption[]>();
    for (const option of requestOptions ?? []) {
      const key = `${option.originCode}-${option.destCode}-${option.flightNo}-${option.aircraftType}-${option.cabin}-${option.fareClassCode}`;
      groups.set(key, [...(groups.get(key) ?? []), option]);
    }
    return [...groups.entries()].map(([key, options]) => ({
      key,
      options: options.sort(
        (left, right) =>
          new Date(left.departureAt).getTime() -
          new Date(right.departureAt).getTime(),
      ),
    }));
  }, [requestOptions]);
  // One card per approved flight series (for example XY1235), never one
  // duplicate card per materialized day. The selected series then supplies
  // its exact CEO-approved occurrences to the month/day picker.
  const visibleFlightOptions = routeGroups
    .filter(({ options }) => {
      const row = options[0];
      return (
        row &&
        (!originCode || row.originCode === originCode) &&
        (!destCode || row.destCode === destCode)
      );
    })
    .map(({ options }) => options[0]!);
  const selectedVisibleIndex = visibleFlightOptions.findIndex(
    (option) => optionKey(option) === requestFlightId,
  );
  const requestGroup =
    routeGroups.find(({ options }) =>
      options.some((row) => optionKey(row) === requestFlightId),
    ) ?? null;
  const requestFlight =
    requestGroup?.options.find((row) => optionKey(row) === requestFlightId) ??
    requestGroup?.options[0] ??
    null;
  const availableRouteCount = routeGroups.length;
  const requestOccurrences = useMemo(() => {
    if (!requestFlight || !requestGroup) return [];
    const start = new Date(requestFlight.departureAt);
    const end = new Date(start);
    if (termMonths === 0) {
      end.setUTCDate(end.getUTCDate() + 7);
    } else {
      end.setUTCMonth(end.getUTCMonth() + termMonths);
    }
    return requestGroup.options.filter((row) => {
      const departure = new Date(row.departureAt);
      return (
        departure >= start &&
        departure <= end &&
        (preferredWeekdays.length === 0 ||
          preferredWeekdays.includes(departure.getUTCDay()))
      );
    });
  }, [preferredWeekdays, requestFlight, requestGroup, termMonths]);
  const orderSeatCount =
    seatInquiryState === "confirmed" && seatInquiry
      ? seatInquiry.suggestedSeats
      : requestedSeats;
  const selectableOccurrences = useMemo(
    () =>
      requestOccurrences.filter((occurrence) => {
        const isInquiredOccurrence =
          seatInquiry?.flightInstanceId === occurrence.flightInstanceId &&
          seatInquiry.cabin === occurrence.cabin &&
          seatInquiry.fareClassCode === occurrence.fareClassCode;
        const availableSeats = isInquiredOccurrence
          ? seatInquiry.availableToRequest
          : occurrence.availableToRequest;
        return availableSeats >= orderSeatCount;
      }),
    [orderSeatCount, requestOccurrences, seatInquiry],
  );
  const activeWeekdays = useMemo(
    () =>
      new Set(
        (requestGroup?.options ?? []).map((occurrence) =>
          new Date(occurrence.departureAt).getUTCDay(),
        ),
      ),
    [requestGroup],
  );
  const weekdayLabels =
    locale === "fa"
      ? ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"]
      : locale === "ar"
        ? ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
        : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthGroups = useMemo(() => {
    const grouped = new Map<
      string,
      { label: string; options: AgencySeatRequestOption[] }
    >();
    const formatter = new Intl.DateTimeFormat(
      locale === "fa"
        ? "fa-IR-u-ca-persian"
        : locale === "ar"
          ? "ar-EG-u-ca-gregory"
          : "en-US-u-ca-gregory",
      { month: "long", year: "numeric", timeZone: "UTC" },
    );
    for (const occurrence of selectableOccurrences) {
      const date = new Date(occurrence.departureAt);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const current = grouped.get(key) ?? {
        label: formatter.format(date),
        options: [],
      };
      current.options.push(occurrence);
      grouped.set(key, current);
    }
    return [...grouped.entries()].map(([key, value]) => ({ key, ...value }));
  }, [locale, selectableOccurrences]);
  const selectedOccurrences = selectableOccurrences.filter((occurrence) =>
    selectedOccurrenceIds.includes(occurrence.flightInstanceId),
  );
  const selectedOrderTotalIrr =
    BigInt(requestFlight?.pricePerSeatIrr ?? "0") *
    BigInt(orderSeatCount) *
    BigInt(selectedOccurrences.length);
  const hasEnoughCredit = Boolean(
    agencyCredit && BigInt(agencyCredit.remainingIrr) >= selectedOrderTotalIrr,
  );
  useEffect(() => {
    setSeatInquiryState("idle");
    setSeatInquiry(null);
    setSeatInquiryError(null);
    setSelectedOccurrenceIds([]);
    setSelectedMonthKeys([]);

    // The catalogue value is only a cached preview. Always let the
    // reservation inquiry endpoint make the authoritative capacity decision,
    // even when the preview currently reports zero available seats.
    if (!requestFlight || requestedSeats < 1) {
      setSeatInquiryLoading(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setSeatInquiryLoading(true);
      void inquireAgencySeats({
        flightInstanceId: requestFlight.flightInstanceId,
        cabin: requestFlight.cabin,
        fareClassCode: requestFlight.fareClassCode,
        seats: requestedSeats,
      })
        .then((result) => {
          if (!active) return;
          setSeatInquiry(result);
          setSeatInquiryState("ready");
        })
        .catch((cause: unknown) => {
          if (!active) return;
          setSeatInquiryError(
            cause instanceof Error ? cause.message : t.errorFallback,
          );
        })
        .finally(() => {
          if (active) setSeatInquiryLoading(false);
        });
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    requestFlightId,
    requestedSeats,
    seatInquiryNonce,
    requestFlight,
    t.errorFallback,
  ]);
  const pendingRequests = requestHistory.filter(
    (row) => row.status === "PENDING" || row.status === "PENDING_FINANCE",
  );
  const rejectedRequests = requestHistory.filter(
    (row) => row.status === "REJECTED",
  );
  const unpaidRequests = requestHistory.filter(
    (row) => row.invoice && row.invoice.status !== "PAID",
  );
  const activeAllotments = (rows ?? []).filter((row) => row.active);
  const activeCatalogueOptions = (requestOptions ?? []).filter(
    (option) =>
      !activeAllotments.some(
        (allotment) =>
          allotment.flightInstanceId === option.flightInstanceId &&
          (!allotment.cabin || allotment.cabin === option.cabin) &&
          (!allotment.fareClassCode ||
            allotment.fareClassCode === option.fareClassCode),
      ),
  );
  const activeFlightCount = new Set(
    [
      ...activeAllotments.map((row) => row.flightInstanceId),
      ...activeCatalogueOptions.map((row) => row.flightInstanceId),
    ],
  ).size;

  function openSeatRequest(option: AgencySeatRequestOption) {
    setOriginCode(option.originCode);
    setDestCode(option.destCode);
    setRequestFlightId(optionKey(option));
    setPreferredWeekdays([]);
    setSeatInquiryState("idle");
    setSeatInquiry(null);
    setSeatInquiryError(null);
    setSelectedOccurrenceIds([]);
    setSelectedMonthKeys([]);
    setActiveView("routes");
  }

  async function submitSeatRequest() {
    if (!requestFlight || orderSeatCount < 1) return;
    setBusy(true);
    setError(null);
    try {
      await requestAgencySeats({
        flightInstanceId: requestFlight.flightInstanceId,
        cabin: requestFlight.cabin,
        fareClassCode: requestFlight.fareClassCode,
        seats: orderSeatCount,
        selectedFlightInstanceIds: selectedOccurrenceIds,
        preferredWeekdays,
        termMonths,
        payMethod,
      });
      setNotice(
        locale === "en"
          ? "Your seat request was sent to the commercial manager."
          : locale === "ar"
            ? "تم إرسال طلب المقاعد إلى المدير التجاري."
            : "درخواست صندلی با موفقیت برای مدیر بازرگانی ارسال شد.",
      );
      setRequestedSeats(0);
      setSeatInquiryState("idle");
      setSeatInquiry(null);
      setSeatInquiryError(null);
      setSelectedOccurrenceIds([]);
      setSelectedMonthKeys([]);
      setRequestHistory(await fetchMySeatRequests());
      setActiveView("requested");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errorFallback);
    } finally {
      setBusy(false);
    }
  }

  async function openSale(row: AgencyAllotmentRow) {
    setError(null);
    setNotice(null);
    setSelectedId(row.id);
    setSeatMap(null);
    setForm({
      fullName: "",
      nationalId: "",
      mobile: "",
      cabin: row.cabin ?? "ECONOMY",
      seatCode: "",
    });
    try {
      setSeatMap(await fetchSeatMap(row.flightInstanceId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errorFallback);
      setSelectedId(null);
    }
  }

  async function submitSale(row: AgencyAllotmentRow) {
    if (!form.fullName.trim() || !form.seatCode) return;
    setBusy(true);
    setError(null);
    try {
      const booking = await createAllotmentBooking(
        row.id,
        {
          cabin: form.cabin,
          passengers: [
            {
              fullName: form.fullName.trim(),
              nationalId: form.nationalId.trim() || undefined,
              mobile: form.mobile.trim() || undefined,
              seatCode: form.seatCode,
            },
          ],
        },
        crypto.randomUUID(),
      );
      setNotice(`بلیت با کد رزرو ${booking.pnr} با موفقیت صادر شد.`);
      setSelectedId(null);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "خطا در صدور بلیت.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="portal-surface-subtle mb-4 rounded-xl p-4 text-xs leading-6 portal-copy-muted">
        ⓘ {t.infoBanner}
      </div>
      <div className="portal-surface-card mb-4 flex gap-2 overflow-x-auto rounded-2xl p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-5 md:overflow-visible">
        {(
          [
            [
              "routes",
              locale === "fa"
                ? "مسیر پروازی موجود"
                : locale === "ar"
                  ? "المسارات المتاحة"
                  : "Available routes",
              availableRouteCount,
            ],
            [
              "requested",
              locale === "fa"
                ? "پروازهای درخواست‌شده"
                : locale === "ar"
                  ? "الرحلات المطلوبة"
                  : "Requested flights",
              pendingRequests.length,
            ],
            [
              "invoices",
              locale === "fa"
                ? "فاکتور پروازهای پرداخت‌نشده"
                : locale === "ar"
                  ? "فواتير الرحلات غير المدفوعة"
                  : "Unpaid flight invoices",
              unpaidRequests.length,
            ],
            [
              "active",
              locale === "fa"
                ? "پروازهای فعال"
                : locale === "ar"
                  ? "الرحلات النشطة"
                  : "Active flights",
              activeFlightCount,
            ],
            [
              "rejected",
              locale === "fa"
                ? "پروازهای کنسل‌شده"
                : locale === "ar"
                  ? "الرحلات الملغاة"
                  : "Cancelled flights",
              rejectedRequests.length,
            ],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveView(key)}
            className={`flex min-w-[168px] flex-none items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-3 text-[11px] font-black transition md:min-w-0 ${activeView === key ? "bg-[#1668c4] text-white shadow-sm" : "bg-[#f8fafc] text-[#687587] hover:bg-[#f1f5fa]"}`}
          >
            <span>{label}</span>
            <span
              className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] ${activeView === key ? "bg-white/20 text-white" : "bg-white text-[#1668c4]"}`}
            >
              {localeDigits(count, locale)}
            </span>
          </button>
        ))}
      </div>

      {activeView === "routes" && (
        <section
          className="mb-5"
          data-testid="agency-seat-request-panel"
        >
          <div className="mb-4">
            <h2 className="text-base font-black text-[#0d2640]">
              {locale === "en"
                ? "Available flight routes"
                : locale === "ar"
                  ? "مسارات الرحلات المتاحة"
                  : "مسیرهای پروازی موجود"}
            </h2>
          </div>

          <div className="grid gap-3 rounded-2xl border border-[#e1e8f2] bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_auto]">
            <label className="text-[11px] font-bold text-[#3f546b]">
              {locale === "en"
                ? "Origin"
                : locale === "ar"
                  ? "المغادرة"
                  : "مبدأ"}
              <select
                value={originCode}
                onChange={(event) => {
                  setOriginCode(event.target.value);
                  setDestCode("");
                  setRequestFlightId("");
                }}
                className="mt-1 w-full rounded-xl border border-[#d6e4f8] bg-white p-3 text-sm outline-none"
                data-testid="agency-request-origin"
              >
                <option value="">—</option>
                {origins.map((code) => (
                  <option key={code} value={code}>
                    {airportCityLabel(code, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-bold text-[#3f546b]">
              {locale === "en"
                ? "Destination"
                : locale === "ar"
                  ? "الوجهة"
                  : "مقصد"}
              <select
                value={destCode}
                disabled={!originCode}
                onChange={(event) => {
                  const nextDest = event.target.value;
                  setDestCode(nextDest);
                  setRequestFlightId("");
                }}
                className="mt-1 w-full rounded-xl border border-[#d6e4f8] bg-white p-3 text-sm outline-none disabled:bg-[#f4f6f9]"
                data-testid="agency-request-destination"
              >
                <option value="">—</option>
                {destinations.map((code) => (
                  <option key={code} value={code}>
                    {airportCityLabel(code, locale)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setOriginCode("");
                setDestCode("");
                setRequestFlightId("");
              }}
              className="mt-[18px] rounded-xl border border-[#d6e4f8] bg-[#f7f9fc] px-4 py-3 text-xs font-black text-[#5d6c80]"
            >
              {locale === "fa" ? "پاک کردن" : locale === "ar" ? "مسح" : "Clear"}
            </button>
          </div>

          <div
            className="mt-4 flex flex-col gap-3"
            data-testid="agency-request-route-list"
          >
            {visibleFlightOptions.map((row, index) => {
              const key = optionKey(row);
              const flightGroup = routeGroups.find(({ options }) =>
                options.some((option) => optionKey(option) === key),
              );
              const groupOccurrences = flightGroup?.options ?? [row];
              const occurrenceCount = groupOccurrences.length;
              const groupOccurrenceIds = new Set(
                groupOccurrences.map((option) => option.flightInstanceId),
              );
              const firstOccurrence = groupOccurrences[0] ?? row;
              const lastOccurrence =
                groupOccurrences[groupOccurrences.length - 1] ?? row;
              const isSelected = requestFlightId === key;
              const isReleased =
                row.agencySeatsReleased > 0 &&
                row.availableToRequest > 0 &&
                row.pricePerSeatIrr != null;
              const groupAllotments = (rows ?? []).filter(
                (allotment) =>
                  groupOccurrenceIds.has(allotment.flightInstanceId) &&
                  (!allotment.cabin || allotment.cabin === row.cabin) &&
                  (!allotment.fareClassCode ||
                    allotment.fareClassCode === row.fareClassCode),
              );
              const allocated = groupAllotments.reduce(
                (sum, allotment) => sum + allotment.seatsAllocated,
                0,
              );
              const sold = groupAllotments.reduce(
                (sum, allotment) => sum + allotment.seatsUsed,
                0,
              );
              const remaining = groupAllotments.reduce(
                (sum, allotment) =>
                  sum +
                  Math.max(allotment.seatsAllocated - allotment.seatsUsed, 0),
                0,
              );
              return (
                <article
                  key={key}
                  data-testid={`agency-request-card-${row.flightInstanceId}`}
                  style={{
                    order:
                      selectedVisibleIndex >= 0 && index > selectedVisibleIndex
                        ? index * 2 + 1
                        : index * 2,
                  }}
                  className={`w-full cursor-pointer overflow-hidden rounded-2xl border text-start transition ${isSelected ? "border-[#9fc2ec] bg-[#f8fbff]" : "border-[#e8eef6] bg-white hover:border-[#bfd4ef]"}`}
                >
                  <button
                    type="button"
                    data-testid={`agency-request-route-${row.flightInstanceId}`}
                    onClick={() => {
                      setOriginCode(row.originCode);
                      setDestCode(row.destCode);
                      setRequestFlightId(isSelected ? "" : key);
                      setPreferredWeekdays([]);
                    }}
                    className="flex w-full flex-wrap items-center justify-between gap-4 p-4 text-start"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#eef5fd] text-xl text-[#1668c4]">
                        ✈
                      </span>
                      <div>
                        <b className="block text-sm text-[#0d2640]">
                          {airportCityLabel(row.originCode, locale)} ←{" "}
                          {airportCityLabel(row.destCode, locale)}
                        </b>
                        <span
                          dir="ltr"
                          className="mt-1 block text-[11px] text-[#7d8ba0]"
                        >
                          {row.flightNo} · {row.aircraftType} · {row.cabin}/
                          {row.fareClassCode}
                        </span>
                        <span className="mt-1 block text-[10px] text-[#7d8ba0]">
                          {locale === "fa"
                            ? `${localeDigits(occurrenceCount, locale)} پرواز فعال؛ ماه‌ها و روزها پس از استعلام نمایش داده می‌شود`
                            : locale === "ar"
                              ? `${localeDigits(occurrenceCount, locale)} رحلة نشطة؛ تظهر الأشهر والأيام بعد الاستعلام`
                              : `${occurrenceCount} active occurrences; months and days appear after inquiry`}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#7d8ba0]">
                        {locale === "fa"
                          ? "قیمت هر صندلی"
                          : locale === "ar"
                            ? "سعر المقعد"
                            : "Price per seat"}
                      </span>
                      <b
                        className={`mt-1 block text-sm ${isReleased ? "text-[#23895f]" : "text-[#c87322]"}`}
                      >
                        {isReleased
                          ? localeMoney(row.pricePerSeatIrr!, locale)
                          : locale === "fa"
                            ? "قابل درخواست از بازرگانی"
                            : locale === "ar"
                              ? "متاح للطلب من الإدارة التجارية"
                              : "Available to request"}
                      </b>
                    </div>
                    <span
                      aria-hidden="true"
                      className={`text-[#1668c4] transition ${isSelected ? "rotate-180" : ""}`}
                    >
                      ⌄
                    </span>
                  </button>
                  {isSelected && (
                    <div
                      data-testid={`agency-request-flight-${row.flightInstanceId}-expanded`}
                    >
                      <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#cfe1f5] bg-[#eef6ff] px-4 py-3 text-[11px] font-bold text-[#47637f]">
                        {isReleased ? (
                          <>
                            <span>
                              {locale === "fa"
                                ? "بازه فروش صندلی به آژانس‌ها"
                                : locale === "ar"
                                  ? "فترة بيع المقاعد للوكالات"
                                  : "Agency seat sales window"}
                            </span>
                            <span>
                              {formatLocaleDateTime(firstOccurrence.departureAt, locale)}
                              {occurrenceCount > 1
                                ? ` تا ${formatLocaleDateTime(lastOccurrence.departureAt, locale)}`
                                : ""}
                            </span>
                          </>
                        ) : (
                          locale === "fa"
                            ? "پرواز فعال و قابل درخواست است؛ تعداد و تخصیص نهایی پس از بررسی مدیر بازرگانی تأیید می‌شود."
                            : locale === "ar"
                              ? "الرحلة نشطة ومتاحة للطلب؛ يتم اعتماد العدد والتخصيص النهائي بعد مراجعة الإدارة التجارية."
                              : "This flight is active and requestable; the final quantity and allotment are confirmed after commercial review."
                        )}
                      </div>
                      <div className="grid grid-cols-3 border-y border-[#edf1f6] bg-[#fafbfd]">
                        {[
                          ["صندلی فعال", allocated],
                          ["فروخته‌شده از سهم من", sold],
                          ["باقی‌مانده برای فروش", remaining],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="p-3 text-center">
                            <div className="text-[10px] text-[#7d8ba0]">
                              {label}
                            </div>
                            <div className="mt-1 text-lg font-black text-[#1668c4]">
                              {localeDigits(value as number, locale)} صندلی
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="m-4 rounded-xl border border-[#e6ddfa] bg-[#f8f5ff] p-4 text-[11px] text-[#6547a8]">
                        <div className="flex flex-wrap items-center justify-between gap-2 font-black">
                          <span>
                            {locale === "fa"
                              ? "وب‌سرویس مسیر (یک کلید برای تمام پروازهای این مسیر)"
                              : locale === "ar"
                                ? "خدمة ويب للمسار (مفتاح واحد لجميع رحلات المسار)"
                                : "Route API (one key for every flight on this route)"}
                          </span>
                          <span className="rounded-full bg-white px-3 py-1 text-[10px] text-[#8063bd]">
                            API
                          </span>
                        </div>
                        <div className="mt-2 text-[10px] leading-5 text-[#7d6a9f]">
                          {allocated > 0
                            ? locale === "fa"
                              ? "خرید صندلی این مسیر فعال است؛ کلید و وضعیت مصرف در بخش «وب سرویس» آژانس در دسترس است."
                              : "Seat purchase is active; the key and usage status are available in Web service."
                            : locale === "fa"
                              ? "پس از خرید صندلی این مسیر، کلید وب‌سرویس و وضعیت پروازهای شما اینجا نمایش داده می‌شود."
                              : "After purchasing seats, the API key and flight status will appear here."}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

          {requestFlight && (
            <div
              style={{ order: selectedVisibleIndex * 2 + 1 }}
              className="rounded-2xl border border-[#9fc2ec] bg-white p-4 shadow-sm"
              data-testid="agency-request-flight-detail"
            >
              <span className="sr-only">
                {requestFlight.flightNo} · {requestFlight.aircraftType}
              </span>
              <div className="grid items-end gap-3 md:grid-cols-[1.25fr_1fr_auto]">
                <label
                  className="self-start text-[11px] font-bold text-[#3f546b]"
                  data-testid="agency-seat-count-box"
                >
                  {locale === "en"
                    ? "Seats needed"
                    : locale === "ar"
                      ? "عدد المقاعد المطلوبة"
                      : "تعداد صندلی مورد نیاز"}
                  <input
                    type="number"
                    min={1}
                    value={requestedSeats || ""}
                    placeholder="مثلاً ۱۰"
                    onChange={(event) => {
                      setRequestedSeats(Math.max(0, Number(event.target.value) || 0));
                      setSeatInquiryState("idle");
                    }}
                    className="mt-2 h-12 w-full rounded-xl border border-[#9aa9bb] bg-white px-4 text-sm font-bold outline-none transition focus:border-[#1668c4] focus:ring-2 focus:ring-[#d8e9ff]"
                    data-testid="agency-request-seat-count"
                  />
                </label>
                <div
                  className="self-start text-[11px] text-[#3f546b]"
                  data-testid="agency-seat-inquiry-box"
                  aria-live="polite"
                >
                  <div className="mb-2 font-bold text-[#3f546b]">
                    {locale === "fa"
                      ? "پاسخ استعلام"
                      : locale === "ar"
                        ? "نتيجة الاستعلام"
                        : "Inquiry result"}
                  </div>
                  {!seatInquiry && !seatInquiryError && !seatInquiryLoading && (
                    <button
                      type="button"
                      disabled={
                        requestedSeats < 1 ||
                        seatInquiryLoading
                      }
                      onClick={() => setSeatInquiryNonce((value) => value + 1)}
                      className="h-12 w-full rounded-xl border border-[#d6e4f8] bg-[#f6f8fb] px-4 font-black text-[#607086] disabled:opacity-40"
                      data-testid="agency-seat-inquiry"
                    >
                      {locale === "fa"
                        ? "استعلام ظرفیت"
                        : locale === "ar"
                          ? "استعلام السعة"
                          : "Check availability"}
                    </button>
                  )}
                  {seatInquiryLoading && (
                    <div className="grid h-12 place-items-center rounded-xl border border-[#d6e4f8] bg-[#f6f8fb] font-bold text-[#607086]">
                      {locale === "fa" ? "در حال استعلام از رزرواسیون…" : "Checking reservation inventory…"}
                    </div>
                  )}
                  {seatInquiryError && (
                    <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-[#f2c8b0] bg-[#fff4e9] px-3 text-[#b25e18]">
                      <span>{seatInquiryError}</span>
                      <button
                        type="button"
                        onClick={() => setSeatInquiryNonce((value) => value + 1)}
                        className="font-black"
                        data-testid="agency-seat-inquiry"
                      >
                        {locale === "fa" ? "تلاش مجدد" : "Retry"}
                      </button>
                    </div>
                  )}
                  {seatInquiry && seatInquiryState !== "idle" && (
                    <div
                      className={`min-h-12 rounded-xl border px-3 py-2 ${
                        seatInquiry.canFulfillRequested
                          ? "border-[#bfe4d3] bg-[#eefaf4] text-[#23895f]"
                          : "border-red-300 bg-red-50 text-red-700"
                      }`}
                      data-testid="agency-seat-inquiry-result"
                    >
                      <div className="flex items-center justify-between gap-2 font-black">
                        <span>
                          {seatInquiry.canFulfillRequested ? "✓" : "!"} {locale === "fa"
                            ? seatInquiry.canFulfillRequested
                              ? `${localeDigits(seatInquiry.requestedSeats, locale)} صندلی موجود است`
                              : `${localeDigits(seatInquiry.suggestedSeats, locale)} صندلی در حال حاضر قابل ارائه است`
                            : seatInquiry.canFulfillRequested
                              ? `${seatInquiry.requestedSeats} seats are available`
                              : `${seatInquiry.suggestedSeats} seats are currently available`}
                          <span className="sr-only">
                            {locale === "fa"
                              ? `${localeDigits(seatInquiry.requestedSeats, locale)} صندلی درخواستی`
                              : `${seatInquiry.requestedSeats} requested seats`}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSeatInquiryNonce((value) => value + 1)}
                          className="rounded-lg bg-white/80 px-2 py-1 text-[10px]"
                          data-testid="agency-seat-inquiry"
                        >
                          {locale === "fa" ? "استعلام مجدد" : "Refresh"}
                        </button>
                      </div>
                      <details className="mt-2 border-t border-[#d4eee2] pt-2 text-[10px] font-normal text-[#477765]">
                        <summary className="cursor-pointer font-bold">
                          {locale === "fa" ? "جزئیات پاسخ API رزرواسیون" : "Reservation API response details"}
                        </summary>
                        <div className="mt-2 grid gap-1 sm:grid-cols-2">
                          <span>{locale === "fa" ? `فروش تاریخی: ${localeDigits(seatInquiry.historicalAgencySeatsSold, locale)}` : `Historical sales: ${seatInquiry.historicalAgencySeatsSold}`}</span>
                          <span>{locale === "fa" ? `فصل: ${seatInquiry.season}` : `Season: ${seatInquiry.season}`}</span>
                        </div>
                        <div className="mt-2">{seatInquiry.recommendation}</div>
                      </details>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={
                    seatInquiryState !== "ready" ||
                    !seatInquiry ||
                    !seatInquiry.canFulfillRequested ||
                    seatInquiry.suggestedSeats < 1
                  }
                  onClick={() => setSeatInquiryState("confirmed")}
                  className="h-12 min-w-20 rounded-xl bg-[#eef5fd] px-5 text-xs font-black text-[#1668c4] disabled:cursor-not-allowed disabled:opacity-45"
                  data-testid="agency-seat-inquiry-confirm"
                >
                  {seatInquiryState === "confirmed"
                    ? locale === "fa"
                      ? "تأیید شد"
                      : "Confirmed"
                    : locale === "fa"
                      ? "تأیید"
                      : locale === "ar"
                        ? "تأكيد"
                        : "Confirm"}
                </button>
              </div>
              {seatInquiryState !== "confirmed" && (
                <button
                  type="button"
                  disabled
                  className="hidden"
                  data-testid="agency-submit-seat-request"
                >
                  {locale === "fa" ? "ارسال درخواست" : "Submit request"}
                </button>
              )}
              {seatInquiryState === "confirmed" && (
              <fieldset className="mt-5 space-y-5 border-t border-[#edf1f6] pt-5">
                <fieldset
                  className="text-[11px] font-bold text-[#3f546b]"
                  data-testid="agency-active-weekdays"
                >
                  <legend className="mb-2">
                    {locale === "fa"
                      ? "روزهای هفته فعال"
                      : locale === "ar"
                        ? "أيام الأسبوع النشطة"
                        : "Active weekdays"}
                  </legend>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {weekdayLabels.map((label, weekday) => {
                      const active = activeWeekdays.has(weekday);
                      const selected = preferredWeekdays.includes(weekday);
                      return (
                        <button
                          key={weekday}
                          type="button"
                          disabled={!active}
                          data-testid={`agency-weekday-${weekday}`}
                          onClick={() => {
                            setPreferredWeekdays((current) =>
                              selected
                                ? current.filter((day) => day !== weekday)
                                : [...current, weekday],
                            );
                            setSelectedOccurrenceIds([]);
                            setSelectedMonthKeys([]);
                          }}
                          className={`rounded-xl border px-2 py-3 text-center transition ${!active ? "cursor-not-allowed border-[#edf0f4] bg-[#f4f6f9] text-[#b8c0ca]" : selected ? "border-[#23895f] bg-[#23895f] text-white" : "border-[#1668c4] bg-[#eef5ff] text-[#1668c4]"}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset className="text-[11px] font-bold text-[#3f546b]">
                  <legend className="mb-2">
                    {locale === "fa"
                      ? "دوره خرید"
                      : locale === "ar"
                        ? "فترة الشراء"
                        : "Purchase period"}
                  </legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {(
                      [
                        [0, locale === "fa" ? "هفتگی" : locale === "ar" ? "أسبوعي" : "Weekly"],
                        [1, locale === "fa" ? "ماهانه" : locale === "ar" ? "شهري" : "Monthly"],
                        [3, locale === "fa" ? "سه‌ماهه" : locale === "ar" ? "٣ أشهر" : "3 months"],
                        [6, locale === "fa" ? "شش‌ماهه" : locale === "ar" ? "٦ أشهر" : "6 months"],
                        [12, locale === "fa" ? "یک‌ساله" : locale === "ar" ? "سنة" : "1 year"],
                      ] as const
                    ).map(([months, label]) => (
                      <button
                        key={months}
                        type="button"
                        data-testid={`agency-term-${months}`}
                        onClick={() => {
                          setTermMonths(months);
                          setSelectedOccurrenceIds([]);
                          setSelectedMonthKeys([]);
                        }}
                        className={`rounded-xl border px-3 py-3 text-center transition ${termMonths === months ? "border-[#1668c4] bg-[#e8f2ff] text-[#1668c4]" : "border-[#d8e1ec] bg-white text-[#52657a]"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="rounded-xl border border-[#cfe1f5] bg-[#eef6ff] px-4 py-3 text-[11px] font-bold text-[#47637f]">
                  {requestOccurrences.length > 0
                    ? locale === "fa"
                      ? `این پرواز از ${formatLocaleDateTime(requestOccurrences[0]!.departureAt, locale)} تا ${formatLocaleDateTime(requestOccurrences[requestOccurrences.length - 1]!.departureAt, locale)} در روزهای مشخص‌شده فعال است.`
                      : `This flight is active from ${formatLocaleDateTime(requestOccurrences[0]!.departureAt, locale)} to ${formatLocaleDateTime(requestOccurrences[requestOccurrences.length - 1]!.departureAt, locale)}.`
                    : locale === "fa"
                      ? "در بازه انتخاب‌شده پرواز فعالی وجود ندارد."
                      : "No active flight exists in the selected period."}
                </div>

                <fieldset
                  className="text-[11px] font-bold text-[#3f546b]"
                  data-testid="agency-active-months"
                >
                  <legend className="mb-2">
                    {locale === "fa"
                      ? "ماه‌های فعال پرواز"
                      : locale === "ar"
                        ? "أشهر الرحلات النشطة"
                        : "Active flight months"}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {monthGroups.map((month) => {
                      const selected = selectedMonthKeys.includes(month.key);
                      return (
                        <button
                          key={month.key}
                          type="button"
                          data-testid={`agency-month-${month.key}`}
                          onClick={() => {
                            const ids = month.options.map(
                              (option) => option.flightInstanceId,
                            );
                            setSelectedMonthKeys((current) =>
                              selected
                                ? current.filter((key) => key !== month.key)
                                : [...current, month.key],
                            );
                            setSelectedOccurrenceIds((current) =>
                              selected
                                ? current.filter((id) => !ids.includes(id))
                                : [...new Set([...current, ...ids])],
                            );
                          }}
                          className={`min-w-28 rounded-xl border px-4 py-3 text-center transition ${selected ? "border-[#23895f] bg-[#23895f] text-white" : "border-[#1668c4] bg-[#eef5ff] text-[#1668c4]"}`}
                        >
                          <span className="block font-black">{month.label}</span>
                          <span className="mt-1 block text-[10px] opacity-80">
                            {localeDigits(month.options.length, locale)} {locale === "fa" ? "پرواز" : "flights"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset
                  className="text-[11px] font-bold text-[#3f546b]"
                  data-testid="agency-active-dates"
                >
                  <legend className="mb-2">
                    {locale === "fa"
                      ? "روزهای فعال پرواز"
                      : locale === "ar"
                        ? "أيام الرحلات النشطة"
                        : "Active flight dates"}
                  </legend>
                  <div className="rounded-xl border border-[#e6edf5] bg-[#fafbfd] p-3">
                    <div className="mb-3 flex items-center justify-between rounded-xl border border-[#d6e4f8] bg-white px-4 py-3 text-[#52657a]">
                      <span>{locale === "fa" ? "انتخاب تاریخ" : locale === "ar" ? "اختيار التاريخ" : "Select date"}</span>
                      <span aria-hidden="true">▣</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {selectableOccurrences.map((occurrence) => {
                        const selected = selectedOccurrenceIds.includes(
                          occurrence.flightInstanceId,
                        );
                        return (
                          <button
                            key={occurrence.flightInstanceId}
                            type="button"
                            data-testid={`agency-flight-date-${occurrence.flightInstanceId}`}
                            onClick={() =>
                              setSelectedOccurrenceIds((current) =>
                                selected
                                  ? current.filter(
                                      (id) => id !== occurrence.flightInstanceId,
                                    )
                                  : [...current, occurrence.flightInstanceId],
                              )
                            }
                            className={`rounded-xl border px-3 py-3 text-start transition ${selected ? "border-[#23895f] bg-[#23895f] text-white" : "border-[#1668c4] bg-[#eef5ff] text-[#1668c4]"}`}
                          >
                            <span className="block font-black">
                              {formatLocaleDateTime(
                                occurrence.departureAt,
                                locale,
                              )}
                            </span>
                            <span className="mt-1 block text-[10px] opacity-80">
                              {occurrence.flightNo}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </fieldset>

                <div className="rounded-xl border border-[#e8eef6] bg-[#fafbfd] px-4 py-3 text-[11px] font-bold text-[#52657a]">
                  {locale === "fa" ? "پروازهایی که در این بازه برایتان رزرو می‌شود" : "Flights reserved for you in this period"}
                  <span className="mt-1 block font-normal text-[#7d8ba0]">
                    {locale === "fa"
                      ? `${localeDigits(selectedOccurrences.length, locale)} پرواز از روزها و ماه‌های فعال انتخاب شده است.`
                      : `${selectedOccurrences.length} active flight occurrences selected.`}
                  </span>
                </div>
                <div className="rounded-xl border border-[#e8eef6] bg-white p-4">
                  <div className="mb-3 text-[11px] font-bold text-[#7d8ba0]">
                    {locale === "fa"
                      ? "روش پرداخت"
                      : locale === "ar"
                        ? "طريقة الدفع"
                        : "Payment method"}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="agency-request-pay-invoice"
                      onClick={() => setPayMethod("INVOICE")}
                      className={`rounded-xl border px-3 py-3 text-xs font-black ${payMethod === "INVOICE" ? "border-[#1668c4] bg-[#eef5ff] text-[#1668c4]" : "border-[#d6e4f8]"}`}
                    >
                      {locale === "fa" ? "نقدی / صدور فاکتور" : "Invoice"}
                    </button>
                    <button
                      type="button"
                      data-testid="agency-request-pay-credit"
                      disabled={
                        !agencyCredit || BigInt(agencyCredit.remainingIrr) <= 0n
                      }
                      onClick={() => setPayMethod("CREDIT")}
                      className={`rounded-xl border px-3 py-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40 ${payMethod === "CREDIT" ? "border-[#1668c4] bg-[#eef5ff] text-[#1668c4]" : "border-[#d6e4f8]"}`}
                    >
                      {locale === "fa"
                        ? `اعتباری · مانده ${localeMoney(agencyCredit?.remainingIrr ?? "0", locale)} تومان`
                        : `Credit · ${localeMoney(agencyCredit?.remainingIrr ?? "0", locale)} Toman`}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[#e8eef6] bg-[#f8fafc] p-4 text-xs text-[#687587]">
                  <span>
                    {locale === "fa"
                      ? `${localeMoney(requestFlight.pricePerSeatIrr ?? "0", locale)} × ${localeDigits(orderSeatCount, locale)} صندلی × ${localeDigits(selectedOccurrences.length, locale)} پرواز`
                      : `${orderSeatCount} seats × ${selectedOccurrences.length} flights`}
                  </span>
                  <b className="text-base text-[#0d2640]">
                    {localeMoney(selectedOrderTotalIrr.toString(), locale)}
                  </b>
                </div>
                <button
                  type="button"
                  disabled={
                    seatInquiryState !== "confirmed" ||
                    busy ||
                    selectedOccurrences.length === 0 ||
                    orderSeatCount < 1 ||
                    (payMethod === "CREDIT" && !hasEnoughCredit)
                  }
                  onClick={() => void submitSeatRequest()}
                  className="mt-4 w-full rounded-xl bg-[#1668c4] px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                  data-testid="agency-submit-seat-request"
                >
                  {locale === "en"
                    ? "Send request to commercial manager"
                    : locale === "ar"
                      ? "إرسال الطلب إلى المدير التجاري"
                      : "ارسال درخواست به مدیر بازرگانی"}
                </button>
              </fieldset>
              )}
            </div>
          )}
          </div>

          {requestOptions?.length === 0 && (
            <p className="rounded-xl bg-[#f7f9fc] p-4 text-center text-xs text-[#7d8ba0]">
              {locale === "en"
                ? "No scheduled flight route is available."
                : locale === "ar"
                  ? "لا يوجد مسار رحلة مجدول متاح حاليًا."
                  : "هنوز مسیر پروازی زمان‌بندی‌شده‌ای برای درخواست وجود ندارد."}
            </p>
          )}
        </section>
      )}

      {error && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300/40 bg-red-500/10 p-3 text-xs text-red-500">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadAllotments()}
            disabled={allotmentsLoading}
            className="rounded-lg border border-current px-3 py-1.5 font-black disabled:opacity-50"
          >
            {allotmentsLoading
              ? locale === "fa" ? "در حال تلاش…" : "Retrying…"
              : locale === "fa" ? "تلاش دوباره" : "Retry"}
          </button>
        </div>
      )}
      {notice && (
        <p className="mb-4 rounded-xl bg-[#e8f5ee] p-3 text-xs font-bold text-[#1f8a5b]">
          {notice}
        </p>
      )}

      {activeView === "active" &&
        rows &&
        requestOptions &&
        activeFlightCount === 0 && (
          <p className="portal-surface-card rounded-2xl py-12 text-center text-xs portal-copy-muted">
            {t.empty}
          </p>
        )}

      {(activeView === "requested" ||
        activeView === "rejected" ||
        activeView === "invoices") && (
        <div className="space-y-3">
          {(activeView === "requested"
            ? pendingRequests
            : activeView === "rejected"
              ? rejectedRequests
              : unpaidRequests
          ).map((request) => (
            <div
              key={request.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#edf0f5] bg-white p-5"
            >
              <div>
                <div className="text-sm font-black text-[#0d2640]">
                  {request.route ||
                    request.flights.map((flight) => flight.flightNo).join("، ")}
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  {localeDigits(request.seats, locale)}{" "}
                  {locale === "fa" ? "صندلی" : "seats"} ·{" "}
                  {formatLocaleDateTime(request.createdAt, locale)}
                </div>
              </div>
              <div className="text-sm font-black text-[#23895f]">
                {localeMoney(request.totalPriceIrr, locale)}{" "}
                {locale === "fa" ? "تومان" : "Toman"}
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-bold ${request.status === "REJECTED" ? "bg-red-50 text-red-600" : "bg-[#fff1e5] text-[#c87322]"}`}
              >
                {request.status === "REJECTED"
                  ? locale === "fa"
                    ? "ردشده"
                    : "Rejected"
                  : request.invoice
                    ? request.invoice.invoiceNo
                    : locale === "fa"
                      ? "در حال بررسی"
                      : "Under review"}
              </span>
            </div>
          ))}
          {(activeView === "requested"
            ? pendingRequests
            : activeView === "rejected"
              ? rejectedRequests
              : unpaidRequests
          ).length === 0 && (
            <p className="rounded-2xl border border-[#edf0f5] bg-white py-12 text-center text-xs text-muted">
              {t.empty}
            </p>
          )}
        </div>
      )}

      {activeView === "active" && (
        <div className="flex flex-col gap-4">
          {activeAllotments.map((f) => {
            const left = Math.max(f.seatsAllocated - f.seatsUsed, 0);
            const matchingRequestOption = (requestOptions ?? []).find(
              (option) =>
                option.flightInstanceId === f.flightInstanceId &&
                (!f.cabin || f.cabin === option.cabin) &&
                (!f.fareClassCode || f.fareClassCode === option.fareClassCode),
            );
            return (
              <div
                key={f.id}
                data-testid="alloc-card"
                className="portal-surface-card rounded-2xl p-5"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="portal-surface-subtle flex h-10 w-10 items-center justify-center rounded-xl text-base text-[var(--portal-accent)]">
                      ✈
                    </span>
                    <div>
                      <div className="text-sm font-black portal-copy">
                        {f.route}
                      </div>
                      <div className="mt-0.5 text-[11px] portal-copy-muted">
                        <span dir="ltr">{f.flightNo}</span> ·{" "}
                        {formatLocaleDateTime(f.departureAt, locale)}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[10.5px] font-extrabold ${
                      f.active
                        ? "bg-[#34d39924] text-[#1f9b68]"
                        : "bg-surface text-muted"
                    }`}
                  >
                    {f.active ? t.activeBadge : t.releasedBadge}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      [t.allocatedLabel, f.seatsAllocated, "#1668c4"],
                      [t.soldLabel, f.seatsUsed, "#1f8a5b"],
                      [
                        t.remainingLabel,
                        left,
                        left === 0 ? "#d64545" : "#0d2640",
                      ],
                    ] as const
                  ).map(([label, val, color]) => (
                    <div
                      key={label}
                      className="portal-surface-subtle rounded-xl p-3 text-center"
                    >
                      <div className="mb-1 text-[10.5px] portal-copy-muted">
                        {label}
                      </div>
                      <div className="text-lg font-black" style={{ color }}>
                        {localeDigits(val, locale)}
                      </div>
                    </div>
                  ))}
                </div>

                {f.active && left > 0 && selectedId !== f.id && (
                  <button
                    type="button"
                    onClick={() => void openSale(f)}
                    className="mt-4 w-full rounded-xl bg-[#1668c4] px-4 py-3 text-xs font-black text-white"
                  >
                    {t.sell}
                  </button>
                )}

                {matchingRequestOption && selectedId !== f.id && (
                  <button
                    type="button"
                    onClick={() => openSeatRequest(matchingRequestOption)}
                    className="mt-2 w-full rounded-xl border border-[#1668c4] bg-white px-4 py-3 text-xs font-black text-[#1668c4]"
                  >
                    {locale === "en"
                      ? "Request more seats"
                      : locale === "ar"
                        ? "طلب مقاعد إضافية"
                        : "درخواست صندلی بیشتر"}
                  </button>
                )}

                {selectedId === f.id && (
                  <div className="mt-4 rounded-xl border border-[#d6e4f8] bg-[#f8fbff] p-4">
                    {!seatMap ? (
                      <p className="text-center text-xs text-muted">
                        در حال دریافت صندلی‌های آزاد…
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-[11px] font-bold text-[#3f546b] sm:col-span-2">
                          {t.passengerName}
                          <input
                            value={form.fullName}
                            onChange={(event) =>
                              setForm({ ...form, fullName: event.target.value })
                            }
                            className="mt-1 w-full rounded-lg border border-[#d6e4f8] bg-white p-2.5 text-sm outline-none"
                          />
                        </label>
                        <label className="text-[11px] font-bold text-[#3f546b]">
                          {t.nationalId}
                          <input
                            dir="ltr"
                            value={form.nationalId}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                nationalId: event.target.value,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-[#d6e4f8] bg-white p-2.5 text-sm outline-none"
                          />
                        </label>
                        <label className="text-[11px] font-bold text-[#3f546b]">
                          {t.mobile}
                          <input
                            dir="ltr"
                            value={form.mobile}
                            onChange={(event) =>
                              setForm({ ...form, mobile: event.target.value })
                            }
                            className="mt-1 w-full rounded-lg border border-[#d6e4f8] bg-white p-2.5 text-sm outline-none"
                          />
                        </label>
                        <label className="text-[11px] font-bold text-[#3f546b]">
                          {t.cabin}
                          <select
                            value={form.cabin}
                            disabled={Boolean(f.cabin)}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                cabin: event.target.value as CabinClass,
                                seatCode: "",
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-[#d6e4f8] bg-white p-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:bg-[#f2f5f9]"
                          >
                            <option value="ECONOMY">
                              {publicCabinLabel("ECONOMY", locale)}
                            </option>
                            <option value="COMFORT">
                              {publicCabinLabel("COMFORT", locale)}
                            </option>
                            <option value="BUSINESS">
                              {publicCabinLabel("BUSINESS", locale)}
                            </option>
                            <option value="FIRST">
                              {publicCabinLabel("FIRST", locale)}
                            </option>
                          </select>
                        </label>
                        <label className="text-[11px] font-bold text-[#3f546b]">
                          {t.seat}
                          <select
                            value={form.seatCode}
                            onChange={(event) =>
                              setForm({ ...form, seatCode: event.target.value })
                            }
                            className="mt-1 w-full rounded-lg border border-[#d6e4f8] bg-white p-2.5 text-sm outline-none"
                          >
                            <option value="">—</option>
                            {seatMap.seats
                              .filter(
                                (seat) =>
                                  seat.status === "FREE" &&
                                  seat.cabin === form.cabin,
                              )
                              .map((seat) => (
                                <option
                                  key={seat.seatCode}
                                  value={seat.seatCode}
                                >
                                  {seat.seatCode}
                                </option>
                              ))}
                          </select>
                        </label>
                        <div className="flex gap-2 sm:col-span-2">
                          <button
                            type="button"
                            disabled={
                              busy || !form.fullName.trim() || !form.seatCode
                            }
                            onClick={() => void submitSale(f)}
                            className="flex-1 rounded-lg bg-[#1f8a5b] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                          >
                            {t.issue}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setSelectedId(null)}
                            className="rounded-lg border border-[#d6e4f8] bg-white px-4 py-2.5 text-xs font-bold text-[#3f546b]"
                          >
                            {t.cancel}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {activeCatalogueOptions.map((option) => (
            <div
              key={optionKey(option)}
              data-testid={`active-flight-card-${option.flightInstanceId}-${option.cabin}-${option.fareClassCode}`}
              className="portal-surface-card rounded-2xl p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="portal-surface-subtle flex h-10 w-10 items-center justify-center rounded-xl text-base text-[var(--portal-accent)]">✈</span>
                  <div>
                    <div className="text-sm font-black portal-copy">
                      {airportCityLabel(option.originCode, locale)} →{" "}
                      {airportCityLabel(option.destCode, locale)}
                    </div>
                    <div className="mt-0.5 text-[11px] portal-copy-muted">
                      <span dir="ltr">{option.flightNo}</span> ·{" "}
                      {formatLocaleDateTime(option.departureAt, locale)}
                    </div>
                  </div>
                </div>
                <span className="rounded-full bg-[#34d39924] px-3 py-1 text-[10.5px] font-extrabold text-[#1f9b68]">{t.activeBadge}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="portal-surface-subtle rounded-xl p-3 text-center">
                  <div className="mb-1 text-[10.5px] portal-copy-muted">
                    {locale === "en" ? "Cabin" : locale === "ar" ? "الدرجة" : "کلاس"}
                  </div>
                  <div className="text-sm font-black portal-copy">
                    {publicCabinLabel(option.cabin, locale)} · {option.fareClassCode}
                  </div>
                </div>
                <div className="portal-surface-subtle rounded-xl p-3 text-center">
                  <div className="mb-1 text-[10.5px] portal-copy-muted">
                    {locale === "en" ? "Sellable seats" : locale === "ar" ? "المقاعد القابلة للبيع" : "صندلی قابل فروش"}
                  </div>
                  <div className="text-lg font-black text-[#1f8a5b]">
                    {localeDigits(option.sellableSeats ?? option.availableToRequest, locale)}
                  </div>
                </div>
                <div className="portal-surface-subtle rounded-xl p-3 text-center">
                  <div className="mb-1 text-[10.5px] portal-copy-muted">
                    {locale === "en" ? "Aircraft" : locale === "ar" ? "الطائرة" : "هواپیما"}
                  </div>
                  <div className="text-sm font-black portal-copy">{option.aircraftType}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openSeatRequest(option)}
                className="mt-4 w-full rounded-xl border border-[#1668c4] bg-white px-4 py-3 text-xs font-black text-[#1668c4]"
              >
                {locale === "en"
                  ? "Request seat allocation"
                  : locale === "ar"
                    ? "طلب تخصيص المقاعد"
                    : "درخواست تخصیص صندلی"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
