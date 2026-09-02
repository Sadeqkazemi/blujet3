import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useAuth } from "../../hooks/useAuth";
import { fetchEmployeeContext } from "../../api/panels";
import {
  changeFlightAircraft,
  createAllotment,
  deleteAllotment,
  fetchAircraftTypes,
  fetchAirports,
  fetchAllotments,
  fetchFlightDetail,
  fetchFlightsOverview,
  patchCommercialPanelSettings,
  planFlight,
  runFlightsAiAnalysis,
} from "../../api/flights";
import { fetchAgencies } from "../../api/agencies";
import { useStepUp } from "../../hooks/useStepUp";
import {
  faDigits,
  faMoney,
  irrToTomanInput,
  latinDigits,
  parseTomanToRialString,
} from "../../lib/fa-format";
import {
  APPROVAL_STATUS_META,
  type FlightApprovalStatus,
} from "../../lib/flight-definition";
import { dayjs, formatJalaliDateTime } from "../../lib/jalali";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";
import FareRulesSection from "../../components/FareRulesSection";
import CommercialFareClassControls from "./components/CommercialFareClassControls";
import CommercialFlightDetailContent from "./components/CommercialFlightDetailContent";
import JalaliDatePicker from "../../components/JalaliDatePicker";
import PricingPage from "../pricing/PricingPage";
import FlightCitiesTab from "./FlightCitiesTab";
import TravelCostsTab from "./TravelCostsTab";
import AddFlightPage from "./AddFlightPage";
import FlightLifecycleModal from "./FlightLifecycleModal";
import MdSeatMapModal from "../reservation/MdSeatMapModal";
import { updatePublishedPrice } from "../../api/pricing";
import type {
  AircraftTypeOption,
  AirportEntry,
  AllotmentRow,
  CompletedFlightRow,
  DerivedFlightStatus,
  FlightDetail,
  FlightRow,
  FlightsOverview,
  FutureFlightRow,
} from "../../types/flights";
import type { AgencyListRow } from "../../types/agencies";

const STATUS_META: Record<
  DerivedFlightStatus,
  { label: string; className: string }
> = {
  ACTIVE: { label: "فعال", className: "bg-[#34d39924] text-[#34d399]" },
  SELLING: { label: "در حال فروش", className: "bg-[#60a5fa2e] text-[#1d4ed8]" },
  FULL: { label: "تکمیل", className: "bg-[#f59e0b24] text-[#b45309]" },
  CANCELLED: { label: "لغو شده", className: "bg-[#f8717124] text-[#dc2626]" },
};

const CHANNEL_META = {
  SYSTEM: { label: "فروش سیستمی", barClass: "bg-accent" },
  CHARTER: { label: "فروش چارتری", barClass: "bg-[#a855f7]" },
  AGENCY: { label: "فروش آژانس همکار", barClass: "bg-[#34d399]" },
} as const;

function occupancyBarClass(pct: number) {
  if (pct >= 100) return "bg-[#f59e0b]";
  if (pct >= 60) return "bg-[#34d399]";
  return "bg-[#60a5fa]";
}

const WEEKDAYS_FA = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function pctOf(n: number, cap: number) {
  return cap > 0 ? Math.max(0, Math.min(100, Math.round((n / cap) * 100))) : 0;
}

function weakestClassLabel(rows: { label: string; capacity: number; sold: number }[]) {
  if (rows.length === 0) return "";
  let minFill = Infinity;
  let label = rows[0].label;
  for (const row of rows) {
    const fill = row.capacity > 0 ? row.sold / row.capacity : 0;
    if (fill < minFill) {
      minFill = fill;
      label = row.label;
    }
  }
  return label;
}

export default function FlightsPage() {
  const { user } = useAuth();
  const [employeePermissionKeys, setEmployeePermissionKeys] = useState<string[]>([]);
  const [data, setData] = useState<FlightsOverview | null>(null);
  const [airports, setAirports] = useState<AirportEntry[]>([]);
  const [subTab, setSubTab] = useState<
    "active" | "done" | "history" | "future" | "ops" | "cities" | "costs"
  >("active");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [editFlightId, setEditFlightId] = useState<string | null>(null);
  const [pricingOverlayOpen, setPricingOverlayOpen] = useState(false);
  const pricingSectionRef = useRef<HTMLDivElement>(null);

  const [detail, setDetail] = useState<FlightDetail | null>(null);
  const [detailTab, setDetailTab] = useState<"details" | "seats">("details");
  const [salePriceToman, setSalePriceToman] = useState("");
  const [salePriceReason, setSalePriceReason] = useState("");
  const [salePriceBusy, setSalePriceBusy] = useState(false);
  const [lifecycleFlight, setLifecycleFlight] = useState<FlightRow | CompletedFlightRow | null>(null);
  const [expandedDone, setExpandedDone] = useState<string | null>(null);
  const [expandedActiveId, setExpandedActiveId] = useState<string | null>(null);
  const [commercialBusy, setCommercialBusy] = useState(false);
  const [classPriceDraft, setClassPriceDraft] = useState<Record<string, string>>({});
  const [agencyReleaseDraft, setAgencyReleaseDraft] = useState<
    Record<string, { seats: string; price: string }>
  >({});

  const [aircraftTypes, setAircraftTypes] = useState<AircraftTypeOption[]>([]);
  const [aircraftChangeOpen, setAircraftChangeOpen] = useState(false);
  const [selectedAircraftType, setSelectedAircraftType] = useState("");
  const [aircraftChangeError, setAircraftChangeError] = useState<string | null>(
    null,
  );
  const [aircraftChangeBusy, setAircraftChangeBusy] = useState(false);
  const aircraftStepUp = useStepUp("PRICE_CAPACITY_CHANGE");

  const [futureDay, setFutureDay] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [filterOrigin, setFilterOrigin] = useState("");
  const [filterDest, setFilterDest] = useState("");
  const [filterFlightNo, setFilterFlightNo] = useState("");
  const [filterDate, setFilterDate] = useState<string | null>(null);
  const [weakAlertIndex, setWeakAlertIndex] = useState(0);
  const [calOpen, setCalOpen] = useState(false);
  const [expandedFuture, setExpandedFuture] = useState<string | null>(null);
  const [plan, setPlan] = useState<FutureFlightRow | null>(null);
  const [planPrice, setPlanPrice] = useState("");
  const [planAgency, setPlanAgency] = useState("");
  const [planSaleStart, setPlanSaleStart] = useState<string | null>(null);
  const [planSaleEnd, setPlanSaleEnd] = useState<string | null>(null);

  const [allotments, setAllotments] = useState<AllotmentRow[]>([]);
  const [agencyOptions, setAgencyOptions] = useState<AgencyListRow[]>([]);
  const [newAllotmentAgencyId, setNewAllotmentAgencyId] = useState("");
  const [newAllotmentSeats, setNewAllotmentSeats] = useState("");
  const [newAllotmentType, setNewAllotmentType] = useState<"HARD" | "SOFT">(
    "HARD",
  );
  const [newAllotmentContractToman, setNewAllotmentContractToman] =
    useState("");
  const [newAllotmentReleaseAt, setNewAllotmentReleaseAt] = useState<
    string | null
  >(null);
  const [allotmentError, setAllotmentError] = useState<string | null>(null);

  const cityByCode = useMemo(
    () => new Map(airports.map((a) => [a.code, a.cityFa])),
    [airports],
  );
  const routeLabel = useCallback(
    (originCode: string, destCode: string) =>
      `${cityByCode.get(originCode) ?? originCode} ← ${cityByCode.get(destCode) ?? destCode}`,
    [cityByCode],
  );

  const load = useCallback(async () => {
    try {
      setData(await fetchFlightsOverview());
    } catch {
      setError("خطا در دریافت اطلاعات پروازها.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    fetchAirports()
      .then(setAirports)
      .catch(() => setAirports([]));
  }, [load]);

  useEffect(() => {
    if (user?.role !== "EMPLOYEE") {
      setEmployeePermissionKeys([]);
      return;
    }
    fetchEmployeeContext()
      .then((context) => setEmployeePermissionKeys(context.permissionKeys))
      .catch(() => setEmployeePermissionKeys([]));
  }, [user?.role]);

  async function openDetail(id: string) {
    setError(null);
    setAircraftChangeOpen(false);
    setAircraftChangeError(null);
    try {
      const d = await fetchFlightDetail(id);
      setDetail(d);
      setDetailTab("details");
      setSelectedAircraftType(d.aircraftType);
      setSalePriceToman(d.basePriceIrr ? irrToTomanInput(d.basePriceIrr) : "");
      setSalePriceReason("");
      setClassPriceDraft({});
      setAgencyReleaseDraft({});
    } catch {
      setError("خطا در دریافت جزئیات پرواز.");
    }
    if (aircraftTypes.length === 0) {
      try {
        setAircraftTypes(await fetchAircraftTypes());
      } catch {
        // silently unavailable — the change control just won't render options
      }
    }
  }

  async function onUpdateSalePrice() {
    if (!detail || !salePriceReason.trim()) {
      setError("دلیل تغییر قیمت الزامی است.");
      return;
    }
    setSalePriceBusy(true);
    setError(null);
    try {
      const salePriceIrr = parseTomanToRialString(salePriceToman);
      if (!salePriceIrr) {
        setError("قیمت فروش معتبر وارد کنید.");
        return;
      }
      const result = await updatePublishedPrice(detail.id, {
        salePriceIrr,
        reason: salePriceReason.trim(),
      });
      setDetail({ ...detail, basePriceIrr: result.registeredPriceIrr });
      setNotice("قیمت فروش در سایت و سرویس API به‌روزرسانی شد.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در تغییر قیمت فروش.");
    } finally {
      setSalePriceBusy(false);
    }
  }

  async function onChangeAircraft() {
    if (
      !detail ||
      !selectedAircraftType ||
      selectedAircraftType === detail.aircraftType
    )
      return;
    setAircraftChangeError(null);
    setAircraftChangeBusy(true);
    try {
      const fields = await aircraftStepUp.confirm();
      const result = await changeFlightAircraft(
        detail.id,
        selectedAircraftType,
        fields,
      );
      setDetail({
        ...detail,
        aircraftType: result.aircraftType,
        capacity: result.capacity,
      });
      setAircraftChangeOpen(false);
      await load();
    } catch (err) {
      if (err instanceof Error && err.message === "CANCELLED") return;
      setAircraftChangeError(
        err instanceof Error ? err.message : "خطا در تغییر نوع هواپیما.",
      );
    } finally {
      setAircraftChangeBusy(false);
    }
  }

  function openPlan(row: FutureFlightRow) {
    setPlan(row);
    const initial = row.basePriceIrr ?? row.aiSuggestion?.priceIrr ?? null;
    setPlanPrice(irrToTomanInput(initial != null ? String(initial) : null));
    setPlanAgency(
      String(
        row.agencySeatsAllocated ??
          Math.round((row.capacity - row.charterSeats) / 2),
      ),
    );
    setAllotmentError(null);
    setNewAllotmentAgencyId("");
    setNewAllotmentSeats("");
    setNewAllotmentType("HARD");
    setNewAllotmentContractToman("");
    setNewAllotmentReleaseAt(null);
    setPlanSaleStart(null);
    setPlanSaleEnd(null);
    fetchAllotments(row.id)
      .then(setAllotments)
      .catch(() => setAllotments([]));
    fetchAgencies({})
      .then((r) => setAgencyOptions(r.agencies))
      .catch(() => setAgencyOptions([]));
  }

  async function onAddAllotment() {
    if (!plan) return;
    setAllotmentError(null);
    const seats = Number(latinDigits(newAllotmentSeats));
    if (!newAllotmentAgencyId || !Number.isInteger(seats) || seats < 1) {
      setAllotmentError("آژانس و تعداد صندلی معتبر را انتخاب کنید.");
      return;
    }
    try {
      const contractPriceIrr = newAllotmentContractToman.trim()
        ? parseTomanToRialString(newAllotmentContractToman)
        : undefined;
      if (newAllotmentContractToman.trim() && contractPriceIrr == null) {
        setAllotmentError("نرخ قراردادی معتبر وارد کنید.");
        return;
      }
      await createAllotment(plan.id, {
        agencyId: newAllotmentAgencyId,
        seatsAllocated: seats,
        type: newAllotmentType,
        contractPriceIrr: contractPriceIrr ?? undefined,
        releaseAt:
          newAllotmentType === "SOFT"
            ? (newAllotmentReleaseAt ?? undefined)
            : undefined,
      });
      setNewAllotmentAgencyId("");
      setNewAllotmentSeats("");
      setNewAllotmentType("HARD");
      setNewAllotmentContractToman("");
      setNewAllotmentReleaseAt(null);
      setAllotments(await fetchAllotments(plan.id));
    } catch (e) {
      setAllotmentError(e instanceof Error ? e.message : "خطا در ثبت سهمیه.");
    }
  }

  async function onDeleteAllotment(allotmentId: string) {
    if (!plan) return;
    try {
      await deleteAllotment(plan.id, allotmentId);
      setAllotments(await fetchAllotments(plan.id));
    } catch (e) {
      setAllotmentError(e instanceof Error ? e.message : "خطا در حذف سهمیه.");
    }
  }

  async function onSubmitPlan() {
    if (!plan) return;
    setError(null);
    const priceIrr = parseTomanToRialString(planPrice);
    if (priceIrr == null) {
      setError("نرخ نهایی را به تومان و با رقم وارد کنید.");
      return;
    }
    try {
      const result = await planFlight(plan.id, {
        priceIrr,
        agencySeats: Number(latinDigits(planAgency)),
        saleStartsAt: planSaleStart ?? undefined,
        saleEndsAt: planSaleEnd ?? undefined,
      });
      setPlan(null);
      setNotice(
        result.proposalPending
          ? `نرخ و تخصیص صندلی ${routeLabel(plan.originCode, plan.destCode)} ثبت شد و برای تأیید مدیر عامل ارسال شد ✓`
          : `نرخ و تخصیص صندلی ${routeLabel(plan.originCode, plan.destCode)} ثبت شد ✓`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در ثبت نرخ.");
    }
  }

  async function onAiAnalysis() {
    setError(null);
    try {
      const result = await runFlightsAiAnalysis();
      if (!result.available) {
        setNotice(null);
        setError(
          "سرویس تحلیل هوش مصنوعی در دسترس نیست؛ نرخ‌گذاری دستی همچنان ممکن است.",
        );
        return;
      }
      setNotice(
        "تحلیل هوش مصنوعی پروازهای آینده انجام و قیمت پیشنهادی ثبت شد ✓",
      );
      await load();
    } catch {
      setError("خطا در اجرای تحلیل هوش مصنوعی.");
    }
  }

  async function onToggleSiteVisible(
    flight: FlightRow,
    event?: MouseEvent,
  ) {
    event?.stopPropagation();
    const nextVisible = !(flight.publicSaleEnabled ?? flight.siteVisible ?? false);
    setCommercialBusy(true);
    setError(null);
    try {
      await patchCommercialPanelSettings(flight.id, { siteVisible: nextVisible });
      setNotice(
        nextVisible ? "پرواز در سایت نمایش داده می‌شود" : "پرواز از سایت مخفی شد",
      );
      await load();
      if (detail?.id === flight.id) {
        const refreshed = await fetchFlightDetail(flight.id);
        setDetail(refreshed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در تغییر وضعیت نمایش.");
    } finally {
      setCommercialBusy(false);
    }
  }

  async function onSaveClassSitePrice(classLabel: string) {
    if (!detail) return;
    const priceIrr = parseTomanToRialString(classPriceDraft[classLabel] ?? "");
    if (!priceIrr) {
      setError("قیمت کلاس معتبر وارد کنید.");
      return;
    }
    setCommercialBusy(true);
    setError(null);
    try {
      const result = await patchCommercialPanelSettings(detail.id, {
        classSitePrices: { [classLabel]: priceIrr },
      });
      setDetail({ ...detail, ...result, classSitePrices: result.classSitePrices });
      setNotice(`قیمت ${classLabel} ذخیره شد.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره قیمت کلاس.");
    } finally {
      setCommercialBusy(false);
    }
  }

  async function onSaveAgencyRelease(classLabel: string) {
    if (!detail) return;
    const draft = agencyReleaseDraft[classLabel];
    const seats = Number(latinDigits(draft?.seats ?? "0"));
    const priceIrr = parseTomanToRialString(draft?.price ?? "");
    if (!Number.isFinite(seats) || seats <= 0 || !priceIrr) {
      setError("صندلی و قیمت آزادسازی آژانس را کامل کنید.");
      return;
    }
    setCommercialBusy(true);
    setError(null);
    try {
      const result = await patchCommercialPanelSettings(detail.id, {
        agencyRelease: {
          [classLabel]: { seats, priceIrr },
        },
      });
      setDetail({ ...detail, ...result, agencyRelease: result.agencyRelease });
      setAgencyReleaseDraft((current) => {
        const next = { ...current };
        delete next[classLabel];
        return next;
      });
      setNotice(`آزادسازی ${classLabel} برای آژانس ثبت شد.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در آزادسازی آژانس.");
    } finally {
      setCommercialBusy(false);
    }
  }

  async function onToggleAgencyReleaseSpecial(classLabel: string) {
    if (!detail) return;
    const current = detail.agencyRelease?.[classLabel];
    if (!current) return;
    setCommercialBusy(true);
    try {
      const result = await patchCommercialPanelSettings(detail.id, {
        agencyRelease: {
          [classLabel]: { ...current, special: !current.special },
        },
      });
      setDetail({ ...detail, ...result, agencyRelease: result.agencyRelease });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در تغییر وضعیت فوق‌العاده.");
    } finally {
      setCommercialBusy(false);
    }
  }

  const matchesManagementFilters = useCallback(
    (row: {
      originCode: string;
      destCode: string;
      flightNo: string;
      departureAt: string;
    }) => {
      const normalizedFlightNo = latinDigits(filterFlightNo)
        .trim()
        .toLowerCase();
      return (
        (!filterOrigin || row.originCode === filterOrigin) &&
        (!filterDest || row.destCode === filterDest) &&
        (!normalizedFlightNo ||
          latinDigits(row.flightNo).toLowerCase().includes(normalizedFlightNo)) &&
        (!filterDate ||
          dayjs(row.departureAt).format("YYYY-MM-DD") ===
            dayjs(filterDate).format("YYYY-MM-DD"))
      );
    },
    [filterDate, filterDest, filterFlightNo, filterOrigin],
  );

  const activeFlights = useMemo(
    () => (data?.active ?? []).filter(matchesManagementFilters),
    [data?.active, matchesManagementFilters],
  );
  const completedFlights = useMemo(
    () => (data?.completed?.rows ?? []).filter(matchesManagementFilters),
    [data?.completed?.rows, matchesManagementFilters],
  );
  const future = useMemo(
    () => (data?.future ?? []).filter(matchesManagementFilters),
    [data?.future, matchesManagementFilters],
  );

  // Jalali calendar for the month of the first future flight (falls back to
  // today's month) — only days that actually have flights are clickable.
  const calendar = useMemo(() => {
    const anchor = future.length > 0 ? dayjs(future[0].departureAt) : dayjs();
    const jAnchor = anchor.calendar("jalali");
    const monthStart = jAnchor.startOf("month");
    const daysInMonth = jAnchor.daysInMonth();
    const monthLabel = faDigits(jAnchor.format("MMMM YYYY"));
    // Jalali weeks start on شنبه; dayjs .day() → 0=Sunday … 6=Saturday.
    const offset = (monthStart.day() + 1) % 7;
    const flightDays = new Map<string, string>(); // day-of-month → key date
    for (const f of future) {
      const j = dayjs(f.departureAt).calendar("jalali");
      if (j.format("YYYY/MM") === jAnchor.format("YYYY/MM")) {
        flightDays.set(j.format("D"), j.format("YYYY/MM/DD"));
      }
    }
    return { monthLabel, daysInMonth, offset, flightDays };
  }, [future]);

  const visibleFuture = futureDay
    ? future.filter(
        (f) =>
          dayjs(f.departureAt).calendar("jalali").format("YYYY/MM/DD") ===
          futureDay,
      )
    : future;

  const activePager = usePagination(activeFlights);
  const completedPager = usePagination(completedFlights);
  const futurePager = usePagination(visibleFuture);
  const weakActiveFlights = useMemo(
    () =>
      activeFlights.filter(
        (row) =>
          row.salesHealth?.isWeak === true &&
          row.salesHealth.hoursToDeparture >= 0 &&
          row.salesHealth.hoursToDeparture <= 7 * 24,
      ),
    [activeFlights],
  );

  useEffect(() => {
    if (weakActiveFlights.length === 0) {
      setWeakAlertIndex(0);
      return;
    }
    setWeakAlertIndex((index) => index % weakActiveFlights.length);
  }, [weakActiveFlights.length]);

  const kpis = data?.kpis;
  const isCommercial =
    user?.role === "COMMERCIAL_MANAGER" || user?.role === "EMPLOYEE";
  const canPublishFareAndControlSeats = user?.role === "COMMERCIAL_MANAGER";
  const canManageFlights =
    user?.role !== "EMPLOYEE" || employeePermissionKeys.includes("fl_manage");
  const isCeo = user?.role === "CEO";
  const showFuturePanel = subTab === "future";
  const opsFlights = useMemo(() => {
    const OPS: ReadonlySet<string> = new Set([
      "PENDING_OPERATIONS",
      "OPERATIONS_REJECTED",
      "PENDING_CEO",
      "PENDING_REVISION",
      "REJECTED",
      "APPROVED",
      "PUBLISHED",
    ]);
    return future.filter(
      (row) =>
        Boolean(row.pricingRegistered) ||
        (row.approvalStatus != null && OPS.has(row.approvalStatus)),
    );
  }, [future]);
  const opsPager = usePagination(opsFlights);
  const historyFlights = useMemo(() => {
    const rows = [
      ...activeFlights
        .filter((row) => row.derivedStatus !== "CANCELLED")
        .map((row) => ({ kind: "active" as const, row })),
      ...completedFlights.map((row) => ({
        kind: "completed" as const,
        row,
      })),
    ];
    const q = historyQuery.trim().toLowerCase();
    if (!q) return rows;
    const qLatin = latinDigits(q);
    return rows.filter(({ row }) => {
      const route = routeLabel(row.originCode, row.destCode).toLowerCase();
      const flightNo = latinDigits(row.flightNo).toLowerCase();
      return (
        route.includes(q) ||
        flightNo.includes(qLatin) ||
        row.originCode.toLowerCase().includes(qLatin) ||
        row.destCode.toLowerCase().includes(qLatin)
      );
    });
  }, [activeFlights, completedFlights, historyQuery, routeLabel]);

  function exportCompletedFlights() {
    const rows = data?.completed?.rows ?? [];
    if (rows.length === 0) {
      setNotice("پروازی برای خروجی وجود ندارد.");
      return;
    }
    const headers = [
      "مسیر",
      "شماره پرواز",
      "تاریخ پرواز",
      "بلیط",
      "نرخ اصلی",
      "متوسط نرخ",
      "سیستمی",
      "چارتری",
      "آژانس",
      "سود",
      "ضرر",
    ];
    const bodyRows = rows.map((d) => [
      routeLabel(d.originCode, d.destCode),
      d.flightNo,
      formatJalaliDateTime(d.departureAt),
      String(d.tickets),
      faMoney(d.basePriceIrr),
      faMoney(d.avgPriceIrr),
      faMoney(d.channelRevenueIrr.SYSTEM),
      faMoney(d.channelRevenueIrr.CHARTER),
      faMoney(d.channelRevenueIrr.AGENCY),
      faMoney(d.profitIrr),
      faMoney(d.lossIrr),
    ]);
    const html = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"/></head><body><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
    const blob = new Blob([`\ufeff${html}`], {
      type: "application/vnd.ms-excel",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "completed-flights.xls";
    a.click();
    URL.revokeObjectURL(url);
    setNotice("خروجی Excel پروازهای انجام‌شده دانلود شد ✓");
  }

  const subTabs = isCommercial
    ? ([
        ["active", "پروازهای فعال"],
        ["future", "تعیین پرواز"],
        ["done", "پروازهای انجام‌شده"],
        ["cities", "شهرهای پروازی"],
        ["costs", "هزینه‌های سفر"],
        ["history", "تاریخچه پرواز"],
        ["ops", "عملیات"],
      ] as const)
    : ([
        ["active", "پروازهای فعال"],
        ["done", "پروازهای انجام‌شده"],
        ["future", "پروازهای آینده"],
      ] as const);
  const maxAgencySeats = plan ? plan.capacity - plan.charterSeats : 0;
  const agencySeatsNum = plan ? Number(latinDigits(planAgency)) || 0 : 0;
  const directSeats = plan ? Math.max(maxAgencySeats - agencySeatsNum, 0) : 0;

  function pricingStatusLabel(row: FutureFlightRow): string {
    if (row.pricingRegistered) return "نرخ ثبت‌شده";
    if (row.approvalStatus === "PENDING_OPERATIONS")
      return "در انتظار بررسی مدیر عملیات";
    if (row.approvalStatus === "OPERATIONS_REJECTED")
      return "رد شده توسط عملیات — نیاز به اصلاح";
    if (row.approvalStatus === "REJECTED")
      return "رد شده توسط مدیرعامل — نیاز به اصلاح";
    if (row.approvalStatus === "PENDING_CEO") return "در انتظار تأیید مدیرعامل";
    if (row.approvalStatus === "PENDING_REVISION")
      return "تغییرات در انتظار تأیید";
    if (row.approvalStatus === "APPROVED" || row.approvalStatus === "PUBLISHED")
      return "منتشرشده";
    return "نرخ‌گذاری ثبت شده";
  }

  function showPricingLink(row: FutureFlightRow): boolean {
    return (
      Boolean(row.pricingRegistered) ||
      row.approvalStatus === "APPROVED" ||
      row.approvalStatus === "PUBLISHED" ||
      row.approvalStatus === "PENDING_OPERATIONS" ||
      row.approvalStatus === "OPERATIONS_REJECTED" ||
      row.approvalStatus === "PENDING_CEO" ||
      row.approvalStatus === "PENDING_REVISION"
    );
  }

  function openPricingView() {
    if (isCommercial) {
      setSubTab("ops");
      window.setTimeout(() => {
        pricingSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 0);
      return;
    }
    if (isCeo) {
      setPricingOverlayOpen(true);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-black text-panel-ink">مدیریت پروازها</h1>
        <p className="mt-1 text-sm text-panel-muted">
          ایجاد پرواز، پایش موجودی و فروش، گزارش پروازهای انجام‌شده و
          برنامه‌ریزی پروازهای آینده
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg bg-[#34d39915] p-3 text-sm text-[#34d399]">
          {notice}
        </p>
      )}

      {kpis && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-panel-border bg-panel-surface p-4">
            <div className="font-num text-lg font-black text-panel-ink">
              {faDigits(kpis.activeCount)}
            </div>
            <div className="text-[11px] text-panel-muted">پرواز فعال</div>
          </div>
          <div className="rounded-xl border border-panel-border bg-panel-surface p-4">
            <div className="font-num text-lg font-black text-panel-ink">
              {faDigits(kpis.soldSeats)}
            </div>
            <div className="text-[11px] text-panel-muted">صندلی فروخته‌شده</div>
          </div>
          <div className="rounded-xl border border-panel-border bg-panel-surface p-4">
            <div className="font-num text-lg font-black text-[#b45309]">
              {faDigits(kpis.meanOccupancyPct)}٪
            </div>
            <div className="text-[11px] text-panel-muted">
              میانگین ضریب اشغال
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex w-max gap-1 rounded-xl border border-panel-border bg-panel-surface p-1">
        {subTabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
              subTab === key
                ? "bg-accent text-white"
                : "text-panel-muted hover:text-panel-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab !== "cities" && subTab !== "costs" && (
        <section
          className="mb-4 rounded-xl border border-panel-border bg-panel-surface p-4"
          data-testid="flight-management-search"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-extrabold text-panel-ink">
                جستجوی پرواز
              </h2>
              <p className="mt-1 text-[10.5px] text-panel-muted">
                فیلتر بر اساس مبدأ، مقصد، شماره و تاریخ پرواز
              </p>
            </div>
            {(filterOrigin || filterDest || filterFlightNo || filterDate) && (
              <button
                type="button"
                onClick={() => {
                  setFilterOrigin("");
                  setFilterDest("");
                  setFilterFlightNo("");
                  setFilterDate(null);
                }}
                className="text-[10.5px] font-bold text-accent"
              >
                پاک‌کردن فیلترها
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-[10.5px] text-panel-muted">
              مبدأ
              <select
                value={filterOrigin}
                onChange={(event) => setFilterOrigin(event.target.value)}
                data-testid="flight-filter-origin"
                className="mt-1.5 h-10 w-full rounded-lg border border-panel-border bg-panel-canvas px-3 text-xs text-panel-ink outline-none focus:border-accent"
              >
                <option value="">همه مبدأها</option>
                {airports.map((airport) => (
                  <option key={airport.id} value={airport.code}>
                    {airport.cityFa} ({airport.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10.5px] text-panel-muted">
              مقصد
              <select
                value={filterDest}
                onChange={(event) => setFilterDest(event.target.value)}
                data-testid="flight-filter-dest"
                className="mt-1.5 h-10 w-full rounded-lg border border-panel-border bg-panel-canvas px-3 text-xs text-panel-ink outline-none focus:border-accent"
              >
                <option value="">همه مقصدها</option>
                {airports.map((airport) => (
                  <option key={airport.id} value={airport.code}>
                    {airport.cityFa} ({airport.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10.5px] text-panel-muted">
              شماره پرواز
              <input
                dir="ltr"
                value={filterFlightNo}
                onChange={(event) => setFilterFlightNo(event.target.value)}
                placeholder="XY1234"
                data-testid="flight-filter-number"
                className="font-num mt-1.5 h-10 w-full rounded-lg border border-panel-border bg-panel-canvas px-3 text-left text-xs text-panel-ink outline-none placeholder:text-panel-muted focus:border-accent"
              />
            </label>
            <div className="text-[10.5px] text-panel-muted">
              تاریخ پرواز
              <div className="mt-1.5 h-10 rounded-lg border border-panel-border bg-panel-canvas">
                <JalaliDatePicker
                  label="تاریخ پرواز"
                  value={filterDate}
                  onChange={setFilterDate}
                  testId="flight-filter-date"
                  theme="dark"
                  singleLine
                  placeholder="انتخاب تاریخ"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-panel-muted">
          در حال بارگذاری…
        </p>
      ) : (
        <>
          {subTab === "active" && data && (
            <section className="rounded-xl border border-panel-border bg-panel-surface">
              <div className="flex items-center justify-between border-b border-panel-border px-5 py-3">
                <h2 className="text-sm font-bold text-panel-ink">
                  مدیریت پروازها و موجودی
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {isCommercial && canManageFlights && (
                    <button
                      type="button"
                      onClick={() => void onAiAnalysis()}
                      className="rounded-lg bg-[#7c3aed] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#6d28d9]"
                    >
                      ✦ تحلیل فروش ضعیف با هوش مصنوعی
                    </button>
                  )}
                  {canManageFlights && (
                    <button
                      onClick={() => setAddOpen(true)}
                      className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
                    >
                      + افزودن پرواز
                    </button>
                  )}
                </div>
              </div>
              {isCommercial && weakActiveFlights.length > 0 && (
                <div className="border-b border-panel-border bg-[#f59e0b0b] p-4" data-testid="weak-sales-ai-list">
                  {(() => {
                    const flight = weakActiveFlights[weakAlertIndex];
                    if (!flight) return null;
                    return (
                    <article key={flight.id} className="rounded-xl border border-[#f59e0b55] bg-[#171d29] p-4" data-testid={`weak-sales-alert-${flight.id}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-extrabold text-[#fbbf24]">هشدار خودکار فروش ضعیف</div>
                          <div className="ltr font-num mt-1 text-[11px] text-panel-muted">{flight.flightNo} · {flight.originCode} ← {flight.destCode}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="font-num rounded-full bg-[#f59e0b1f] px-2.5 py-1 text-[10px] text-[#fbbf24]">
                            {flight.salesHealth!.hoursToDeparture <= 24
                              ? `${faDigits(Math.ceil(flight.salesHealth!.hoursToDeparture))} ساعت تا پرواز`
                              : `${faDigits(Math.ceil(flight.salesHealth!.hoursToDeparture / 24))} روز تا پرواز`}
                          </span>
                          <span className="font-num rounded-full bg-[#f59e0b1f] px-2.5 py-1 text-[10px] text-[#fbbf24]">فروش {faDigits(flight.sold)} از {faDigits(flight.capacity)}</span>
                        </div>
                      </div>
                      {flight.aiSuggestion ? <div className="mt-3 rounded-lg bg-black/15 p-3"><div className="text-[10px] text-panel-muted">پیشنهاد رقابتی هوش مصنوعی</div><div className="font-num mt-1 text-base font-black text-[#34d399]">{faMoney(flight.aiSuggestion.priceIrr)} تومان</div><p className="mt-1 text-[10.5px] leading-5 text-[#aebbd0]">{flight.aiSuggestion.reason}</p></div> : <p className="mt-3 text-[10.5px] text-panel-muted">پیشنهاد قیمت در حال آماده‌سازی است؛ نرخ فعلی خودکار تغییر نمی‌کند.</p>}
                      <button type="button" onClick={() => void openDetail(flight.id)} className="mt-3 text-[11px] font-bold text-accent">{canManageFlights ? 'مشاهده و مدیریت پرواز' : 'مشاهده پرواز'} ←</button>
                    </article>
                    );
                  })()}
                  {weakActiveFlights.length > 1 && (
                    <div className="mt-3 flex items-center justify-between gap-3" aria-label="اسلایدر هشدار فروش">
                      <button
                        type="button"
                        onClick={() =>
                          setWeakAlertIndex((index) =>
                            (index + 1) % weakActiveFlights.length,
                          )
                        }
                        data-testid="weak-sales-next"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#f59e0b55] text-[#fbbf24]"
                        aria-label="هشدار بعدی"
                      >
                        ‹
                      </button>
                      <div className="flex items-center gap-1.5" data-testid="weak-sales-position">
                        {weakActiveFlights.map((flight, index) => (
                          <button
                            type="button"
                            key={flight.id}
                            onClick={() => setWeakAlertIndex(index)}
                            aria-label={`هشدار ${faDigits(index + 1)}`}
                            className={`h-2 rounded-full transition ${index === weakAlertIndex ? "w-6 bg-[#fbbf24]" : "w-2 bg-[#f59e0b55]"}`}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setWeakAlertIndex((index) =>
                            (index - 1 + weakActiveFlights.length) %
                            weakActiveFlights.length,
                          )
                        }
                        data-testid="weak-sales-previous"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#f59e0b55] text-[#fbbf24]"
                        aria-label="هشدار قبلی"
                      >
                        ›
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="overflow-x-auto">
                <div className={isCommercial ? "min-w-0" : "min-w-[760px]"}>
                  {isCommercial ? (
                    <>
                      <div className="sr-only">
                        <span>مسیر / پرواز</span>
                        <span>وضعیت ظرفیت</span>
                        <span>تفکیک کلاس</span>
                        <span>قیمت و نمایش سایت</span>
                      </div>
                      <ul data-testid="commercial-active-flights" className="grid grid-cols-1 gap-3 p-3">
                        {activePager.pageItems.map((f) => {
                          const pct =
                            f.capacity > 0
                              ? Math.round((f.sold / f.capacity) * 100)
                              : 0;
                          const st = STATUS_META[f.derivedStatus];
                          const classes = f.classBreakdown ?? [];
                          const weakLabel = weakestClassLabel(classes);
                          const relSeats = f.agencyReleaseSeats ?? 0;
                          const locked = f.lockedSeats ?? 0;
                          const avail = Math.max(
                            0,
                            f.capacity - f.sold - relSeats - locked,
                          );
                          const pubOn = f.publicSaleEnabled ?? f.siteVisible ?? false;
                          const expanded = expandedActiveId === f.id;
                          return (
                            <li key={f.id} className="min-w-0">
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => void openDetail(f.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    void openDetail(f.id);
                                  }
                                }}
                                data-testid={`commercial-flight-card-${f.id}`}
                                className={`group grid w-full grid-cols-1 gap-3 rounded-2xl border border-panel-border bg-panel-surface p-3 text-right text-xs shadow-[0_12px_32px_-26px_rgba(13,38,64,.55)] transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_18px_38px_-24px_rgba(22,104,196,.38)] md:grid-cols-2 ${f.salesHealth?.isWeak ? "ring-1 ring-[#ef444433]" : ""}`}
                              >
                                <span className="min-w-0 border-b border-panel-border pb-3 md:col-span-2">
                                  <span className="mb-2 flex items-center justify-between gap-3">
                                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-accent/10 text-accent" aria-hidden>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m2 16 20-8-6 8-5-2-4 4-1-6Z" /></svg>
                                    </span>
                                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${st.className}`}>
                                      {st.label}
                                    </span>
                                  </span>
                                  <span className="block text-[14px] font-black text-panel-ink">
                                    {routeLabel(f.originCode, f.destCode)}
                                  </span>
                                  <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-panel-muted">
                                    <span className="ltr font-num rounded-md bg-panel-surface-2 px-2 py-1">{f.flightNo}</span>
                                    <span className="font-num">{formatJalaliDateTime(f.departureAt)}</span>
                                  </span>
                                  {f.routeAgencyPriceIrr ? (
                                    <span className="mt-2 inline-block rounded-md bg-[#8b5cf624] px-2 py-0.5 text-[9px] font-bold text-[#a78bfa]">
                                      وب‌سرویس مسیر: {faMoney(f.routeAgencyPriceIrr)} تومان
                                    </span>
                                  ) : (
                                    <span className="mt-2 inline-block rounded-md bg-panel-surface-2 px-2 py-0.5 text-[9px] text-panel-muted">
                                      وب‌سرویس: تعریف‌نشده
                                    </span>
                                  )}
                                </span>
                                <span className="rounded-xl bg-panel-canvas p-3">
                                  <span className="mb-2 block text-[10px] font-extrabold text-panel-ink">وضعیت ظرفیت</span>
                                  <span className="font-num mb-1 block text-[10px] text-panel-muted">
                                    فروخته {faDigits(f.sold)} · آژانس {faDigits(relSeats)} · قفل {faDigits(locked)} · آزاد {faDigits(avail)}
                                  </span>
                                  <span className="flex h-2 overflow-hidden rounded bg-panel-surface-2">
                                    <span className="h-full bg-[#60a5fa]" style={{ width: `${pctOf(f.sold, f.capacity)}%` }} />
                                    <span className="h-full bg-[#a855f7]" style={{ width: `${pctOf(relSeats, f.capacity)}%` }} />
                                    <span className="h-full bg-[#f59e0b]" style={{ width: `${pctOf(locked, f.capacity)}%` }} />
                                  </span>
                                  <span className="font-num mt-2 block text-[10px] font-bold text-accent">ضریب اشغال {faDigits(pct)}٪</span>
                                </span>
                                <span className="rounded-xl bg-panel-canvas p-3">
                                  <span className="mb-2 block text-[10px] font-extrabold text-panel-ink">تفکیک کلاس‌های پروازی</span>
                                  {classes.length > 0 ? (
                                    <span className="flex flex-col gap-1">
                                      {(expanded ? classes : classes.slice(0, 2)).map((c) => (
                                        <span
                                          key={c.label}
                                          className={`flex items-center justify-between rounded px-2 py-1 text-[10px] ${c.label === weakLabel ? "bg-[#f8717120] text-[#f87171]" : "bg-panel-canvas text-panel-muted"}`}
                                        >
                                          <span>{c.label}</span>
                                          <span className="font-num">{faDigits(c.sold)}/{faDigits(c.capacity)}</span>
                                        </span>
                                      ))}
                                      {classes.length > 2 && (
                                        <span
                                          role="button"
                                          tabIndex={0}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedActiveId(expanded ? null : f.id);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setExpandedActiveId(expanded ? null : f.id);
                                            }
                                          }}
                                          className="text-[10px] font-bold text-accent"
                                        >
                                          {expanded ? "کمتر" : `+${faDigits(classes.length - 2)} کلاس دیگر`}
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="font-num text-[10px] text-panel-muted">
                                      {faDigits(f.sold)}/{faDigits(f.capacity)} ({faDigits(pct)}٪)
                                    </span>
                                  )}
                                </span>
                                <span className="flex flex-col gap-2 rounded-xl border border-panel-border p-3 md:col-span-2">
                                  <span className="text-[10px] font-extrabold text-panel-ink">نرخ و کانال فروش</span>
                                  <span className="flex flex-wrap items-center justify-between gap-3">
                                  <span className="font-num font-bold text-panel-ink">
                                    {f.basePriceIrr != null ? `${faMoney(f.basePriceIrr)} تومان` : "—"}
                                  </span>
                                  {canManageFlights && (
                                    <span className="flex items-center gap-2">
                                      <span className={`text-[9px] font-bold ${pubOn ? "text-[#34d399]" : "text-[#fbbf24]"}`}>
                                        {pubOn ? "فعال در سایت" : "در انتظار مجوز"}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={commercialBusy}
                                        onClick={(e) => void onToggleSiteVisible(f, e)}
                                        className={`relative h-5 w-9 rounded-full transition ${pubOn ? "bg-[#16a34a]" : "bg-[#3a4459]"}`}
                                        aria-label="نمایش در سایت"
                                      >
                                        <span
                                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${pubOn ? "left-0.5" : "right-0.5"}`}
                                        />
                                      </button>
                                    </span>
                                  )}
                                  </span>
                                  <span className="text-[10px] font-bold text-accent opacity-0 transition group-hover:opacity-100">مشاهده و مدیریت جزئیات ←</span>
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <>
                  <div className="grid grid-cols-[1.7fr_1.1fr_1.4fr_1.5fr_1.2fr_0.9fr] gap-3 border-b border-panel-border px-5 py-2 text-[11px] font-bold text-panel-muted">
                    <span>مسیر</span>
                    <span>شماره پرواز</span>
                    <span>تاریخ / ساعت</span>
                    <span>ظرفیت</span>
                    <span>قیمت پایه</span>
                    <span>وضعیت</span>
                  </div>
                  <ul>
                    {activePager.pageItems.map((f) => {
                      const pct =
                        f.capacity > 0
                          ? Math.round((f.sold / f.capacity) * 100)
                          : 0;
                      const st = STATUS_META[f.derivedStatus];
                      return (
                        <li key={f.id}>
                          <button
                            onClick={() => void openDetail(f.id)}
                            className="grid w-full grid-cols-[1.7fr_1.1fr_1.4fr_1.5fr_1.2fr_0.9fr] items-center gap-3 border-b border-panel-border px-5 py-3 text-right text-xs transition hover:bg-panel-surface-2/50"
                          >
                            <span className="font-bold text-panel-ink">
                              {routeLabel(f.originCode, f.destCode)}
                            </span>
                            <span className="ltr font-num text-panel-muted">
                              {f.flightNo}
                            </span>
                            <span className="font-num text-panel-muted">
                              {formatJalaliDateTime(f.departureAt)}
                            </span>
                            <span>
                              <span className="font-num block text-[10px] text-panel-muted">
                                {faDigits(f.sold)} / {faDigits(f.capacity)}
                              </span>
                              <span className="mt-1 block h-1.5 overflow-hidden rounded bg-panel-surface-2">
                                <span
                                  className={`block h-full ${occupancyBarClass(pct)}`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </span>
                            </span>
                            <span className="font-num font-bold text-panel-ink">
                              {f.basePriceIrr != null
                                ? `${faMoney(f.basePriceIrr)} تومان`
                                : "—"}
                            </span>
                            <span>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${st.className}`}
                              >
                                {st.label}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                    </>
                  )}
                  {activeFlights.length === 0 && (
                    <p className="py-6 text-center text-xs text-panel-muted">
                      {data.active.length === 0
                        ? "پروازی ثبت نشده است."
                        : "پروازی مطابق فیلترها یافت نشد."}
                    </p>
                  )}
                  <Pagination
                    page={activePager.page}
                    totalPages={activePager.totalPages}
                    onChange={activePager.setPage}
                    variant="dark"
                  />
                </div>
              </div>

            </section>
          )}

          {subTab === "ops" && isCommercial && data && (
            <div className="flex flex-col gap-4">
              <section className="overflow-hidden rounded-xl border border-panel-border bg-panel-surface">
                <div className="border-b border-panel-border px-[15px] py-[13px]">
                  <h2 className="m-0 text-[14.5px] font-extrabold text-panel-ink">
                    تعیین قیمت پرواز و ارسال برای بررسی مدیر عملیات
                  </h2>
                  <p className="mt-1 text-[11.5px] leading-6 text-panel-muted">
                    روی هر پرواز کلیک کنید تا جزئیات، وضعیت و نظر مدیر عملیات را ببینید و در صورت نیاز تاریخ، ساعت، قیمت، تعداد صندلی یا بار مجاز را اصلاح و دوباره برای بررسی ارسال کنید.
                  </p>
                </div>
                <div className="flex flex-col">
                  {opsPager.pageItems.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setEditFlightId(row.id)}
                      className="flex items-center justify-between gap-3 border-b border-[#1a2436] px-[15px] py-3.5 text-right transition hover:bg-[#18223a]"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-extrabold text-panel-ink">
                          {routeLabel(row.originCode, row.destCode)}
                        </span>
                        <span
                          className="ltr font-num rounded-[7px] bg-[#18223a] px-[9px] py-[3px] text-[10.5px] font-bold text-panel-muted"
                          dir="ltr"
                        >
                          {row.flightNo}
                        </span>
                        {row.approvalStatus === "PENDING_REVISION" ||
                        row.approvalStatus === "OPERATIONS_REJECTED" ||
                        row.approvalStatus === "REJECTED" ? (
                          <span className="rounded-[10px] bg-[rgba(245,158,11,.14)] px-[9px] py-[3px] text-[9.5px] font-extrabold text-[#fbbf24]">
                            اصلاح‌شده
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={`shrink-0 rounded-[14px] px-3 py-[5px] text-[10.5px] font-bold whitespace-nowrap ${
                          row.approvalStatus != null
                            ? APPROVAL_STATUS_META[
                                row.approvalStatus as FlightApprovalStatus
                              ].className
                            : "bg-accent/15 text-accent"
                        }`}
                      >
                        {pricingStatusLabel(row)}
                      </span>
                    </button>
                  ))}
                  {opsFlights.length === 0 && (
                    <p className="px-[15px] py-[22px] text-center text-[11.5px] text-panel-muted">
                      پروازی برای قیمت‌گذاری ثبت نشده است.
                    </p>
                  )}
                </div>
                {opsFlights.length > 0 && (
                  <div className="border-t border-panel-border px-4 py-3">
                    <Pagination
                      page={opsPager.page}
                      totalPages={opsPager.totalPages}
                      onChange={opsPager.setPage}
                      variant="dark"
                    />
                  </div>
                )}
              </section>
              <div ref={pricingSectionRef} id="embedded-pricing">
                <PricingPage embedded />
              </div>
            </div>
          )}

          {subTab === "history" && isCommercial && data && (
            <section className="rounded-xl border border-panel-border bg-panel-surface" data-testid="active-flight-history">
              <div className="border-b border-panel-border px-5 py-4">
                <h2 className="text-sm font-bold text-panel-ink">تاریخچه پرواز</h2>
                <p className="mt-1 text-[11px] text-panel-muted">جستجو بر اساس مسیر یا شماره پرواز؛ شامل پروازهای فعال و انجام‌شده.</p>
                <div className="relative mt-3 max-w-md">
                  <input
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.target.value)}
                    placeholder="جستجو بر اساس مسیر یا شماره پرواز…"
                    className="w-full rounded-lg border border-panel-border bg-panel-canvas px-3 py-2.5 text-xs text-panel-ink outline-none placeholder:text-panel-muted focus:border-accent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
                {historyFlights.map(({ kind, row }) => (
                  <button key={`${kind}-${row.id}`} type="button" onClick={() => setLifecycleFlight(row)} className="rounded-xl border border-panel-border bg-panel-canvas p-4 text-right transition hover:border-accent/60">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-panel-ink">{routeLabel(row.originCode, row.destCode)}</div>
                        <div className="ltr font-num mt-1 text-[11px] text-panel-muted">{row.flightNo}</div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${kind === "completed" ? "bg-[#34d39924] text-[#34d399]" : STATUS_META[(row as FlightRow).derivedStatus].className}`}>
                        {kind === "completed" ? "انجام‌شده" : STATUS_META[(row as FlightRow).derivedStatus].label}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-panel-border pt-3 text-[11px]"><span className="font-num text-panel-muted">{formatJalaliDateTime(row.departureAt)}</span><span className="font-bold text-accent">مشاهده همه جزئیات ←</span></div>
                  </button>
                ))}
                {historyFlights.length === 0 && <p className="col-span-full py-8 text-center text-xs text-panel-muted">{historyQuery.trim() ? "پروازی با این مشخصات یافت نشد." : "پروازی برای نمایش تاریخچه وجود ندارد."}</p>}
              </div>
            </section>
          )}

          {subTab === "done" && data && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-xl border border-panel-border bg-panel-surface p-4">
                  <div className="text-[11px] text-panel-muted">
                    مجموع فروش بلیط
                  </div>
                  <div className="font-num mt-1 text-sm font-black text-panel-ink">
                    {faMoney(data.completed.kpis.totalSalesIrr)} تومان
                  </div>
                </div>
                <div className="rounded-xl border border-panel-border bg-panel-surface p-4">
                  <div className="text-[11px] text-panel-muted">سود حاصله</div>
                  <div className="font-num mt-1 text-sm font-black text-[#34d399]">
                    {faMoney(data.completed.kpis.totalProfitIrr)} تومان
                  </div>
                </div>
                <div className="rounded-xl border border-panel-border bg-panel-surface p-4">
                  <div className="text-[11px] text-panel-muted">
                    بلیط فروخته‌شده
                  </div>
                  <div className="font-num mt-1 text-sm font-black text-panel-ink">
                    {faDigits(data.completed.kpis.totalTickets)}
                  </div>
                </div>
                <div className="rounded-xl border border-panel-border bg-panel-surface p-4">
                  <div className="text-[11px] text-panel-muted">
                    پرواز انجام‌شده
                  </div>
                  <div className="font-num mt-1 text-sm font-black text-panel-ink">
                    {faDigits(data.completed.kpis.flightCount)}
                  </div>
                </div>
              </div>

              <section className="rounded-xl border border-panel-border bg-panel-surface">
                <div className="flex items-center justify-between border-b border-panel-border px-5 py-3">
                  <h2 className="text-sm font-bold text-panel-ink">
                    گزارش پروازهای انجام‌شده
                  </h2>
                  <button
                    type="button"
                    onClick={exportCompletedFlights}
                    className="rounded-lg border border-[#34d399]/40 bg-[#34d39915] px-3 py-1.5 text-[11px] font-bold text-[#34d399]"
                  >
                    ↓ خروجی Excel
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <div
                    className={isCommercial ? "min-w-[920px]" : "min-w-[1100px]"}
                  >
                    {isCommercial ? (
                      <>
                        <div className="grid grid-cols-[1.5fr_0.9fr_0.8fr_1fr_1fr_1fr_1fr_1.1fr] gap-2 border-b border-panel-border px-5 py-2 text-[10px] font-bold text-panel-muted">
                          <span>مسیر</span>
                          <span>پرواز</span>
                          <span>بلیط</span>
                          <span>قیمت استاندارد</span>
                          <span>فروش سیستمی</span>
                          <span>فروش چارتری</span>
                          <span>فروش آژانس</span>
                          <span>سود حاصله</span>
                        </div>
                        {completedPager.pageItems.map(
                          (d: CompletedFlightRow) => (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => setLifecycleFlight(d)}
                              className="grid w-full grid-cols-[1.5fr_0.9fr_0.8fr_1fr_1fr_1fr_1fr_1.1fr] items-center gap-2 border-b border-panel-border px-5 py-3 text-right text-[11px] transition hover:bg-panel-surface-2/50"
                            >
                              <span>
                                <span className="block font-bold text-panel-ink">
                                  {routeLabel(d.originCode, d.destCode)}
                                </span>
                                <span className="font-num block text-[10px] text-panel-muted">
                                  {formatJalaliDateTime(d.departureAt)}
                                </span>
                              </span>
                              <span className="ltr font-num text-panel-muted">
                                {d.flightNo}
                              </span>
                              <span className="font-num font-bold text-panel-ink">
                                {faDigits(d.tickets)}
                              </span>
                              <span className="font-num text-panel-muted">
                                {faMoney(d.basePriceIrr)}
                              </span>
                              <span className="font-num text-accent">
                                {faMoney(d.channelRevenueIrr.SYSTEM)}
                              </span>
                              <span className="font-num text-[#7c3aed]">
                                {faMoney(d.channelRevenueIrr.CHARTER)}
                              </span>
                              <span className="font-num text-[#34d399]">
                                {faMoney(d.channelRevenueIrr.AGENCY)}
                              </span>
                              <span className="font-num font-black text-[#34d399]">
                                {Number(d.profitIrr) > 0
                                  ? faMoney(d.profitIrr)
                                  : "—"}
                              </span>
                            </button>
                          ),
                        )}
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-[1.5fr_0.8fr_0.6fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-2 border-b border-panel-border px-5 py-2 text-[10px] font-bold text-panel-muted">
                          <span>مسیر</span>
                          <span>پرواز</span>
                          <span>بلیط</span>
                          <span>نرخ اصلی</span>
                          <span>متوسط نرخ</span>
                          <span>سیستمی</span>
                          <span>چارتری</span>
                          <span>آژانس</span>
                          <span>سود حاصله</span>
                          <span>ضرر</span>
                        </div>
                        {completedPager.pageItems.map(
                          (d: CompletedFlightRow) => (
                            <div key={d.id}>
                              <button
                                onClick={() => {
                                  setExpandedDone(expandedDone === d.id ? null : d.id);
                                  setLifecycleFlight(d);
                                }}
                                className="grid w-full grid-cols-[1.5fr_0.8fr_0.6fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] items-center gap-2 border-b border-panel-border px-5 py-3 text-right text-[11px] transition hover:bg-panel-surface-2/50"
                              >
                                <span>
                                  <span className="block font-bold text-panel-ink">
                                    {routeLabel(d.originCode, d.destCode)}
                                  </span>
                                  <span className="font-num block text-[10px] text-panel-muted">
                                    {formatJalaliDateTime(d.departureAt)}
                                  </span>
                                </span>
                                <span className="ltr font-num text-panel-muted">
                                  {d.flightNo}
                                </span>
                                <span className="font-num font-bold text-panel-ink">
                                  {faDigits(d.tickets)}
                                </span>
                                <span className="font-num text-panel-muted">
                                  {faMoney(d.basePriceIrr)}
                                </span>
                                <span className="font-num font-bold text-panel-ink">
                                  {faMoney(d.avgPriceIrr)}
                                </span>
                                <span className="font-num text-accent">
                                  {faMoney(d.channelRevenueIrr.SYSTEM)}
                                </span>
                                <span className="font-num text-[#a855f7]">
                                  {faMoney(d.channelRevenueIrr.CHARTER)}
                                </span>
                                <span className="font-num text-[#34d399]">
                                  {faMoney(d.channelRevenueIrr.AGENCY)}
                                </span>
                                <span className="font-num font-black text-[#34d399]">
                                  {Number(d.profitIrr) > 0
                                    ? `${faMoney(d.profitIrr)}`
                                    : "—"}
                                </span>
                                <span
                                  className={`font-num font-black ${Number(d.lossIrr) > 0 ? "text-danger" : "text-panel-muted"}`}
                                >
                                  {Number(d.lossIrr) > 0
                                    ? faMoney(d.lossIrr)
                                    : "—"}
                                </span>
                              </button>
                              {expandedDone === d.id && (
                                <div className="grid grid-cols-2 gap-3 border-b border-panel-border bg-panel-canvas px-5 py-3 text-[11px] md:grid-cols-3">
                                  <div>
                                    <div className="text-[10px] text-panel-muted">
                                      تعداد صندلی فروخته‌شده
                                    </div>
                                    <div className="font-num font-bold text-panel-ink">
                                      {faDigits(d.tickets)} بلیط
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-panel-muted">
                                      نرخ اصلی بلیط
                                    </div>
                                    <div className="font-num font-bold text-panel-ink">
                                      {faMoney(d.basePriceIrr)} تومان
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-panel-muted">
                                      جمع فروش
                                    </div>
                                    <div className="font-num font-bold text-panel-ink">
                                      {faMoney(d.revenueIrr)} تومان
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-panel-muted">
                                      متوسط نرخ بلیط فروخته‌شده
                                    </div>
                                    <div className="font-num font-bold text-panel-ink">
                                      {faMoney(d.avgPriceIrr)} تومان
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-panel-muted">
                                      سود حاصله
                                    </div>
                                    <div className="font-num font-bold text-[#34d399]">
                                      {Number(d.profitIrr) > 0
                                        ? `${faMoney(d.profitIrr)} تومان`
                                        : "—"}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-panel-muted">
                                      ضرر
                                    </div>
                                    <div
                                      className={`font-num font-bold ${Number(d.lossIrr) > 0 ? "text-danger" : "text-panel-muted"}`}
                                    >
                                      {Number(d.lossIrr) > 0
                                        ? `${faMoney(d.lossIrr)} تومان`
                                        : "—"}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ),
                        )}
                      </>
                    )}
                    {data.completed.rows.length === 0 && (
                      <p className="py-6 text-center text-xs text-panel-muted">
                        پرواز انجام‌شده‌ای ثبت نشده است.
                      </p>
                    )}
                    <Pagination
                      page={completedPager.page}
                      totalPages={completedPager.totalPages}
                      onChange={completedPager.setPage}
                      variant="dark"
                    />
                  </div>
                </div>
              </section>
            </div>
          )}

          {subTab === "cities" && isCommercial && (
            <FlightCitiesTab
              airports={airports}
              onCreated={(a) =>
                setAirports((prev) =>
                  [...prev, a].sort((x, y) =>
                    x.cityFa.localeCompare(y.cityFa, "fa"),
                  ),
                )
              }
              onDeleted={(id) =>
                setAirports((prev) =>
                  prev.filter((airport) => airport.id !== id),
                )
              }
            />
          )}

          {subTab === "costs" && isCommercial && <TravelCostsTab />}


          {showFuturePanel && data && (
            <div className="flex flex-col gap-4">
              <p className="rounded-xl border border-accent/25 bg-accent/5 p-3 text-[11px] leading-6 text-panel-muted">
                برنامه‌ریزی پروازهای آینده: ظرفیت، تعهد چارتری و قیمت‌گذاری
                پیشنهادی هوش مصنوعی بر اساس تحلیل تقاضا و رقبا.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] text-panel-muted">
                  فیلتر بر اساس روز:
                </span>
                <div className="relative">
                  <button
                    onClick={() => setCalOpen((v) => !v)}
                    className="rounded-lg border border-panel-border bg-panel-surface px-3 py-2 text-xs font-bold text-panel-ink"
                  >
                    {futureDay ? faDigits(futureDay) : "همه‌ی روزها"} ▾
                  </button>
                  {calOpen && (
                    <div className="absolute right-0 top-11 z-40 w-72 rounded-xl border border-panel-border bg-panel-surface p-3 shadow-xl">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-black text-panel-ink">
                          {calendar.monthLabel}
                        </span>
                        <span className="text-[10px] text-panel-muted">
                          فقط روزهای دارای پرواز
                        </span>
                      </div>
                      <div className="mb-1 grid grid-cols-7 gap-1">
                        {WEEKDAYS_FA.map((w, i) => (
                          <span
                            key={w}
                            className={`py-0.5 text-center text-[9px] font-bold ${i === 6 ? "text-danger" : "text-panel-muted"}`}
                          >
                            {w}
                          </span>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: calendar.offset }).map((_, i) => (
                          <span key={`b${i}`} />
                        ))}
                        {Array.from({ length: calendar.daysInMonth }).map(
                          (_, i) => {
                            const day = String(i + 1);
                            const key = calendar.flightDays.get(day);
                            const selected = key != null && futureDay === key;
                            return (
                              <button
                                key={day}
                                disabled={key == null}
                                onClick={() => {
                                  if (key != null) {
                                    setFutureDay(key);
                                    setCalOpen(false);
                                  }
                                }}
                                className={`aspect-square rounded-lg text-[11px] font-bold ${
                                  selected
                                    ? "bg-accent text-white"
                                    : key != null
                                      ? "bg-accent/10 text-accent"
                                      : "cursor-default text-panel-muted/50"
                                }`}
                              >
                                {faDigits(day)}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {futureDay && (
                  <button
                    onClick={() => setFutureDay(null)}
                    className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[11px] font-bold text-danger"
                  >
                    ✕ پاک‌کردن فیلتر
                  </button>
                )}
              </div>

              <section className="rounded-xl border border-panel-border bg-panel-surface">
                <div className="flex items-center justify-between border-b border-panel-border px-5 py-3">
                  <h2 className="text-sm font-bold text-panel-ink">
                    {isCommercial
                      ? "تعیین پرواز (برنامه‌ریزی‌شده)"
                      : "پروازهای آینده (برنامه‌ریزی‌شده)"}
                  </h2>
                  <button
                    onClick={() => void onAiAnalysis()}
                    hidden={!canManageFlights}
                    className="rounded-lg bg-gradient-to-l from-accent to-[#9333ea] px-3 py-2 text-xs font-bold text-white"
                  >
                    پیشنهاد قیمت هوش مصنوعی
                  </button>
                </div>
                <div className="flex flex-col gap-3 p-4">
                  {visibleFuture.length === 0 && (
                    <p className="py-5 text-center text-[11px] text-panel-muted">
                      برای روز انتخاب‌شده پروازی برنامه‌ریزی نشده است.
                    </p>
                  )}
                  {futurePager.pageItems.map((u) => {
                    const expanded = expandedFuture === u.id;
                    const priced = u.agencySeatsAllocated != null;
                    const direct = priced
                      ? Math.max(
                          u.capacity -
                            u.charterSeats -
                            (u.agencySeatsAllocated ?? 0),
                          0,
                        )
                      : 0;
                    const approvalMeta =
                      u.approvalStatus != null
                        ? APPROVAL_STATUS_META[
                            u.approvalStatus as FlightApprovalStatus
                          ]
                        : null;
                    const editDisabled = u.canEdit === false;
                    const pricingVisible = showPricingLink(u);
                    return (
                      <div
                        key={u.id}
                        className="rounded-xl border border-panel-border bg-panel-canvas p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <button
                            onClick={() =>
                              setExpandedFuture(expanded ? null : u.id)
                            }
                            className="flex items-center gap-3 text-right"
                          >
                            <span className="text-panel-muted">
                              {expanded ? "▾" : "◂"}
                            </span>
                            <span>
                              <span className="block text-sm font-black text-panel-ink">
                                {routeLabel(u.originCode, u.destCode)}
                              </span>
                              <span className="block text-[11px] text-panel-muted">
                                شماره پرواز{" "}
                                <span className="ltr font-num">
                                  {u.flightNo}
                                </span>{" "}
                                · تاریخ پرواز{" "}
                                <span className="font-num">
                                  {formatJalaliDateTime(u.departureAt)}
                                </span>
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-2">
                                {approvalMeta && (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${approvalMeta.className}`}
                                  >
                                    {approvalMeta.label}
                                  </span>
                                )}
                                {pricingVisible && (
                                  <span className="text-[10px] text-panel-muted">
                                    {pricingStatusLabel(u)}
                                  </span>
                                )}
                                {pricingVisible && isCeo && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPricingView();
                                    }}
                                    className="text-[10px] font-bold text-accent underline-offset-2 hover:underline"
                                  >
                                    مشاهده در پنل تأیید مدیرعامل
                                  </button>
                                )}
                                {pricingVisible && isCommercial && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPricingView();
                                    }}
                                    className="text-[10px] font-bold text-accent underline-offset-2 hover:underline"
                                  >
                                    مشاهده در پنل قیمت‌گذاری
                                  </button>
                                )}
                              </span>
                            </span>
                          </button>
                          {canManageFlights && <div className="flex flex-wrap items-center gap-2">
                            <div className="flex flex-col items-end gap-1">
                              <button
                                type="button"
                                disabled={editDisabled}
                                onClick={() => setEditFlightId(u.id)}
                                className="rounded-lg border border-panel-border bg-panel-surface px-3 py-2 text-xs font-bold text-panel-ink transition hover:bg-panel-surface-2/80 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                ویرایش مشخصات
                              </button>
                              {editDisabled && u.editBlockedReason && (
                                <span className="max-w-[220px] text-end text-[10px] leading-5 text-danger">
                                  {u.editBlockedReason}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => openPlan(u)}
                              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                                priced
                                  ? "border border-panel-border bg-panel-surface text-panel-muted"
                                  : "bg-accent text-white hover:bg-accent/90"
                              }`}
                            >
                              {priced ? "ویرایش نرخ" : "نرخ‌گذاری"}
                            </button>
                          </div>}
                        </div>

                        {expanded && (
                          <>
                            <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
                              <div className="rounded-lg border border-panel-border bg-panel-surface p-2.5">
                                <div className="text-[10px] text-panel-muted">
                                  ظرفیت صندلی
                                </div>
                                <div className="font-num font-bold text-panel-ink">
                                  {faDigits(u.capacity)} صندلی
                                </div>
                              </div>
                              <div className="rounded-lg border border-panel-border bg-panel-surface p-2.5">
                                <div className="text-[10px] text-panel-muted">
                                  تعهد چارتری
                                </div>
                                <div className="font-num font-bold text-[#7c3aed]">
                                  {faDigits(u.charterSeats)} صندلی
                                </div>
                              </div>
                              <div className="rounded-lg border border-panel-border bg-panel-surface p-2.5">
                                <div className="text-[10px] text-panel-muted">
                                  قیمت پیشنهادی AI
                                </div>
                                {u.aiSuggestion ? (
                                  <div className="font-num font-bold text-[#34d399]">
                                    {faMoney(u.aiSuggestion.priceIrr)} تومان{" "}
                                    <span className="rounded bg-[#9333ea1f] px-1 text-[9px] font-bold text-[#7c3aed]">
                                      AI
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-panel-muted">
                                    در انتظار تحلیل
                                  </div>
                                )}
                              </div>
                              <div className="rounded-lg border border-panel-border bg-panel-surface p-2.5">
                                <div className="text-[10px] text-panel-muted">
                                  نرخ نهایی / تخصیص
                                </div>
                                {priced ? (
                                  <>
                                    <div className="font-num font-bold text-[#34d399]">
                                      {faMoney(u.basePriceIrr ?? 0)} تومان
                                    </div>
                                    <div className="font-num text-[9px] text-panel-muted">
                                      آژانس{" "}
                                      {faDigits(u.agencySeatsAllocated ?? 0)} ·
                                      مستقیم {faDigits(direct)}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-panel-muted">
                                    تعیین نشده
                                  </div>
                                )}
                              </div>
                            </div>
                            {u.aiSuggestion && (
                              <div className="mt-3 rounded-lg border border-[#9333ea40] bg-gradient-to-l from-accent/5 to-[#9333ea0d] p-3">
                                <div className="mb-1 text-[11px] font-black text-[#7c3aed]">
                                  تحلیل هوش مصنوعی — چرا این قیمت؟
                                </div>
                                <p className="mb-2 text-[11px] leading-6 text-panel-ink">
                                  {u.aiSuggestion.reason}
                                </p>
                                <ul className="flex flex-col gap-1">
                                  {u.aiSuggestion.factors.map((fc) => (
                                    <li
                                      key={fc}
                                      className="text-[10px] text-panel-muted"
                                    >
                                      • {fc}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                  <Pagination
                    page={futurePager.page}
                    totalPages={futurePager.totalPages}
                    onChange={futurePager.setPage}
                    variant="dark"
                  />
                </div>
              </section>
            </div>
          )}
        </>
      )}

      {addOpen && (
        <AddFlightPage
          onClose={() => setAddOpen(false)}
          onSuccess={(message) => {
            setAddOpen(false);
            setNotice(message);
            setSubTab("active");
            void load();
          }}
        />
      )}

      {editFlightId && (
        <AddFlightPage
          mode="edit"
          flightId={editFlightId}
          onClose={() => setEditFlightId(null)}
          onSuccess={(message) => {
            setEditFlightId(null);
            setNotice(message);
            void load();
          }}
        />
      )}

      {pricingOverlayOpen && isCeo && (
        <div className="fixed inset-0 z-[110] overflow-y-auto bg-[#0b1220]">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#1f2a3d] bg-[#0b1220] px-6 py-3">
            <h2 className="text-sm font-black text-white">
              پنل تأیید مدیرعامل — قیمت‌گذاری
            </h2>
            <button
              type="button"
              onClick={() => setPricingOverlayOpen(false)}
              className="rounded-lg border border-[#24304a] bg-[#141d2e] px-3 py-2 text-xs font-bold text-[#9fb0c7]"
            >
              بستن
            </button>
          </div>
          <PricingPage />
        </div>
      )}

      {detail && (
        <Modal
          title={`${routeLabel(detail.originCode, detail.destCode)} · ${detail.flightNo}`}
          onClose={() => setDetail(null)}
          maxWidthClass="max-w-[840px]"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-panel-border bg-panel-canvas px-3 py-2.5 text-[10px] text-panel-muted">
            <span className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-sm text-accent" aria-hidden="true">✈</span>
              <span className="font-bold text-panel-ink">{detail.flightNo} · {detail.aircraftType}</span>
            </span>
            <span className="font-num">{formatJalaliDateTime(detail.departureAt)}</span>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-panel-border bg-panel-canvas p-1">
            <button type="button" onClick={() => setDetailTab("details")} className={`rounded-lg px-4 py-2.5 text-xs font-extrabold transition ${detailTab === "details" ? "bg-panel-surface text-accent shadow-sm" : "text-panel-muted hover:text-panel-ink"}`}>
              جزئیات پرواز
            </button>
            <button type="button" onClick={() => setDetailTab("seats")} className={`rounded-lg px-4 py-2.5 text-xs font-extrabold transition ${detailTab === "seats" ? "bg-panel-surface text-accent shadow-sm" : "text-panel-muted hover:text-panel-ink"}`}>
              نقشه صندلی
            </button>
          </div>
          {detailTab === "details" && (user?.role === "COMMERCIAL_MANAGER" || user?.role === "SENIOR_MANAGER") && (
            <CommercialFlightDetailContent
              detail={detail}
              canManage={user?.role === "COMMERCIAL_MANAGER" && canManageFlights}
              onNotice={setNotice}
              onError={setError}
              onChanged={async () => {
                await load();
                setDetail(await fetchFlightDetail(detail.id));
              }}
              onConfirm={() => setDetail(null)}
            />
          )}
          {!(user?.role === "COMMERCIAL_MANAGER" || user?.role === "SENIOR_MANAGER") && (
          <div className={detailTab === "details" ? "block" : "hidden"}>
          <div className="mb-3 grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-lg bg-panel-canvas p-2.5">
              <div className="text-[10px] text-panel-muted">
                صندلی فروخته‌شده
              </div>
              <div className="font-num font-black text-panel-ink">
                {faDigits(detail.sold)} / {faDigits(detail.capacity)}
              </div>
            </div>
            <div className="rounded-lg bg-panel-canvas p-2.5">
              <div className="text-[10px] text-panel-muted">ضریب اشغال</div>
              <div className="font-num font-black text-[#34d399]">
                {faDigits(detail.occupancyPct)}٪
              </div>
            </div>
            <div className="rounded-lg bg-panel-canvas p-2.5">
              <div className="text-[10px] text-panel-muted">قیمت پایه</div>
              <div className="font-num font-black text-accent">
                {detail.basePriceIrr != null
                  ? `${faMoney(detail.basePriceIrr)} تومان`
                  : "—"}
              </div>
            </div>
          </div>

          <h3 className="mb-2 text-xs font-bold text-panel-ink">
            تفکیک کانال فروش صندلی
          </h3>
          <div className="flex flex-col gap-2.5">
            {detail.channels.map((c) => {
              const meta = CHANNEL_META[c.channel];
              const pct =
                detail.sold > 0 ? Math.round((c.seats / detail.sold) * 100) : 0;
              return (
                <div key={c.channel}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-panel-muted">{meta.label}</span>
                    <span className="font-num font-bold text-panel-ink">
                      {faDigits(c.seats)} صندلی · {faMoney(c.revenueIrr)} تومان
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded bg-panel-surface-2">
                    <div
                      className={`h-full ${meta.barClass}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg bg-panel-canvas p-3">
            <span className="text-xs font-bold text-panel-ink">
              مجموع درآمد پرواز
            </span>
            <span className="font-num text-sm font-black text-accent">
              {faMoney(detail.totalRevenueIrr)} تومان
            </span>
          </div>

          {isCommercial && (
            <div className="mt-3 flex flex-col gap-3" data-testid="commercial-flight-detail">
              <div
                className={`rounded-xl border p-3 ${detail.publicSaleEnabled ?? detail.siteVisible ?? false ? "border-[#34d39955] bg-[#34d39910]" : "border-[#f59e0b55] bg-[#f59e0b10]"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-extrabold text-panel-ink">
                      {detail.publicSaleEnabled ?? detail.siteVisible ?? false
                        ? "مجوز نمایش و فروش در سایت فعال است"
                        : "پرواز در سایت مخفی است"}
                    </div>
                    <p className="mt-1 text-[10px] text-panel-muted">
                      تغییر این وضعیت بلافاصله در جستجوی عمومی و رزرو آنلاین اعمال می‌شود.
                    </p>
                  </div>
                  {canManageFlights && (
                    <button
                      type="button"
                      disabled={commercialBusy}
                      onClick={() => void onToggleSiteVisible(detail)}
                      className={`rounded-lg px-3 py-2 text-[11px] font-bold text-white ${detail.publicSaleEnabled ?? detail.siteVisible ?? false ? "bg-[#f59e0b]" : "bg-[#34d399]"}`}
                    >
                      {detail.publicSaleEnabled ?? detail.siteVisible ?? false ? "مخفی از سایت" : "نمایش در سایت"}
                    </button>
                  )}
                </div>
              </div>

              {(detail.classBreakdown ?? []).length > 0 && (
                <div className="hidden" data-commercial-section="legacy-public-fare-classes">
                  <h3 className="mb-2 text-xs font-bold text-panel-ink">قیمت سایت به ازای کلاس</h3>
                  <div className="flex flex-col gap-2">
                    {(detail.classBreakdown ?? []).map((row) => {
                      const saved = detail.classSitePrices?.[row.label];
                      const defaultPrice =
                        saved ??
                        (detail.basePriceIrr != null ? detail.basePriceIrr : null);
                      return (
                        <div key={row.label} className="grid gap-2 rounded-lg bg-panel-canvas p-2 sm:grid-cols-[1fr_1fr_auto]">
                          <span className="text-[11px] font-bold text-panel-ink">{row.label}</span>
                          <input
                            value={
                              classPriceDraft[row.label] ??
                              (defaultPrice != null ? irrToTomanInput(defaultPrice) : "")
                            }
                            onChange={(e) =>
                              setClassPriceDraft((current) => ({
                                ...current,
                                [row.label]: e.target.value,
                              }))
                            }
                            inputMode="numeric"
                            placeholder="قیمت (تومان)"
                            className="rounded-lg border border-panel-border bg-panel-surface px-2 py-1.5 text-[11px] text-panel-ink outline-none"
                          />
                          {canManageFlights && (
                            <button
                              type="button"
                              disabled={commercialBusy}
                              onClick={() => void onSaveClassSitePrice(row.label)}
                              className="rounded-lg bg-accent px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                            >
                              ذخیره
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(detail.classBreakdown ?? []).length > 0 && (
                <div className="hidden" data-commercial-section="legacy-agency-fare-release">
                  <h3 className="mb-2 text-xs font-bold text-panel-ink">آزادسازی صندلی برای آژانس</h3>
                  <div className="flex flex-col gap-2">
                    {(detail.classBreakdown ?? []).map((row) => {
                      const saved = detail.agencyRelease?.[row.label];
                      const draft = agencyReleaseDraft[row.label];
                      return (
                        <div key={`rel-${row.label}`} className="rounded-lg bg-panel-canvas p-2">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-panel-ink">{row.label}</span>
                            {saved?.special ? (
                              <span className="rounded-full bg-[#f59e0b24] px-2 py-0.5 text-[9px] font-bold text-[#fbbf24]">فوق‌العاده</span>
                            ) : null}
                          </div>
                          {saved ? (
                            <div className="font-num text-[10px] text-panel-muted">
                              {faDigits(saved.seats)} صندلی · {faMoney(saved.priceIrr)} تومان
                              {canManageFlights && (
                                <button
                                  type="button"
                                  disabled={commercialBusy}
                                  onClick={() => void onToggleAgencyReleaseSpecial(row.label)}
                                  className="mr-2 text-[10px] font-bold text-accent"
                                >
                                  {saved.special ? "حذف فوق‌العاده" : "علامت فوق‌العاده"}
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                              <input
                                value={draft?.seats ?? ""}
                                onChange={(e) =>
                                  setAgencyReleaseDraft((current) => ({
                                    ...current,
                                    [row.label]: {
                                      seats: latinDigits(e.target.value),
                                      price: current[row.label]?.price ?? "",
                                    },
                                  }))
                                }
                                inputMode="numeric"
                                placeholder="تعداد صندلی"
                                className="rounded-lg border border-panel-border bg-panel-surface px-2 py-1.5 text-[11px] outline-none"
                              />
                              <input
                                value={draft?.price ?? ""}
                                onChange={(e) =>
                                  setAgencyReleaseDraft((current) => ({
                                    ...current,
                                    [row.label]: {
                                      seats: current[row.label]?.seats ?? "",
                                      price: e.target.value,
                                    },
                                  }))
                                }
                                inputMode="numeric"
                                placeholder="قیمت آژانس (تومان)"
                                className="rounded-lg border border-panel-border bg-panel-surface px-2 py-1.5 text-[11px] outline-none"
                              />
                              {canManageFlights && (
                                <button
                                  type="button"
                                  disabled={commercialBusy}
                                  onClick={() => void onSaveAgencyRelease(row.label)}
                                  className="rounded-lg bg-[#7c3aed] px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                                >
                                  ثبت
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(detail.priceHistory ?? []).length > 0 && (
                <div className="order-3 rounded-xl border border-panel-border p-3" data-commercial-section="price-history">
                  <h3 className="mb-2 text-xs font-bold text-panel-ink">تاریخچه تغییر قیمت</h3>
                  <ul className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                    {(detail.priceHistory ?? []).map((entry) => (
                      <li key={entry.id} className="rounded-lg bg-panel-canvas p-2 text-[10px]">
                        <div className="font-num font-bold text-panel-ink">
                          {entry.previousPriceIrr ? faMoney(entry.previousPriceIrr) : "—"} ← {faMoney(entry.salePriceIrr)} تومان
                        </div>
                        <div className="mt-1 text-panel-muted">{entry.reason}</div>
                        <div className="mt-1 flex justify-between text-[9px] text-panel-muted">
                          <span>{entry.actorName}</span>
                          <span className="font-num">{formatJalaliDateTime(entry.createdAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {canPublishFareAndControlSeats && canManageFlights && (
            <div className="mt-3 rounded-xl border border-[#7c3aed66] bg-[#7c3aed0c] p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold text-panel-ink">اصلاح قیمت فروش این پرواز</div>
                  <div className="mt-1 text-[10px] text-panel-muted">تغییر پس از کنترل نرخ قانونی، هم‌زمان در جستجوی سایت و API منتشر می‌شود.</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDetailTab("seats");
                  }}
                  className="rounded-lg border border-accent px-3 py-2 text-[11px] font-bold text-accent"
                >
                  نقشه صندلی MD‑80
                </button>
              </div>
              {detail.aiSuggestion && (
                <button
                  type="button"
                  onClick={() => setSalePriceToman(irrToTomanInput(String(detail.aiSuggestion!.priceIrr)))}
                  className="mb-3 w-full rounded-lg border border-[#34d39955] bg-[#34d39912] p-2 text-right text-[11px] text-[#34d399]"
                >
                  استفاده از پیشنهاد هوش مصنوعی: {faMoney(detail.aiSuggestion.priceIrr)} تومان — {detail.aiSuggestion.reason}
                </button>
              )}
              <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                <input
                  value={salePriceToman}
                  onChange={(event) => setSalePriceToman(event.target.value)}
                  inputMode="numeric"
                  placeholder="قیمت جدید (تومان)"
                  className="rounded-lg border border-panel-border-2 bg-panel-canvas px-3 py-2 text-xs text-panel-ink outline-none"
                />
                <input
                  value={salePriceReason}
                  onChange={(event) => setSalePriceReason(event.target.value)}
                  placeholder="دلیل تغییر قیمت"
                  className="rounded-lg border border-panel-border-2 bg-panel-canvas px-3 py-2 text-xs text-panel-ink outline-none"
                />
                <button
                  type="button"
                  disabled={salePriceBusy}
                  onClick={() => void onUpdateSalePrice()}
                  className="rounded-lg bg-[#7c3aed] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {salePriceBusy ? "در حال انتشار…" : "انتشار نرخ"}
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 rounded-lg border border-panel-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-panel-ink">
                نوع هواپیما
              </span>
              {!aircraftChangeOpen && canManageFlights && (
                <button
                  onClick={() => {
                    setSelectedAircraftType(detail.aircraftType);
                    setAircraftChangeError(null);
                    setAircraftChangeOpen(true);
                  }}
                  className="text-[11px] font-bold text-accent"
                >
                  تغییر
                </button>
              )}
            </div>
            {!aircraftChangeOpen ? (
              <div className="text-xs font-bold text-panel-ink">
                {detail.aircraftType}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <select
                  value={selectedAircraftType}
                  onChange={(e) => setSelectedAircraftType(e.target.value)}
                  className="rounded-lg border border-panel-border-2 bg-panel-canvas p-2 text-xs text-panel-ink outline-none"
                >
                  {aircraftTypes.map((t) => (
                    <option key={t.aircraftType} value={t.aircraftType}>
                      {t.aircraftType} (ظرفیت {faDigits(t.capacity)})
                    </option>
                  ))}
                </select>
                {aircraftChangeError && (
                  <p role="alert" className="text-[11px] text-danger">
                    {aircraftChangeError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    disabled={aircraftChangeBusy}
                    onClick={() => void onChangeAircraft()}
                    className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    {aircraftChangeBusy ? "در حال ثبت…" : "ثبت تغییر"}
                  </button>
                  <button
                    onClick={() => setAircraftChangeOpen(false)}
                    className="rounded-lg bg-panel-canvas px-3 py-1.5 text-[11px] font-bold text-panel-muted"
                  >
                    انصراف
                  </button>
                </div>
              </div>
            )}
          </div>

          <FareRulesSection instanceId={detail.id} readOnly={!canManageFlights} />
          <CommercialFareClassControls
            instanceId={detail.id}
            canManage={canPublishFareAndControlSeats && canManageFlights}
            onNotice={setNotice}
            onError={setError}
          />
          </div>
          )}
          {detailTab === "seats" && (
            <MdSeatMapModal
              embedded
              canManageOverride={canPublishFareAndControlSeats}
              flight={detail}
              onClose={() => setDetailTab("details")}
              onNotice={setNotice}
              onError={setError}
              onChanged={() => void load()}
            />
          )}
        </Modal>
      )}
      {aircraftStepUp.modal}

      {plan && (
        <Modal
          title={`نرخ‌گذاری و تخصیص · ${routeLabel(plan.originCode, plan.destCode)}`}
          onClose={() => setPlan(null)}
        >
          <div className="mb-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-panel-canvas p-2.5">
              <div className="text-[10px] text-panel-muted">ظرفیت</div>
              <div className="font-num font-bold text-panel-ink">
                {faDigits(plan.capacity)} صندلی
              </div>
            </div>
            <div className="rounded-lg bg-panel-canvas p-2.5">
              <div className="text-[10px] text-panel-muted">تعهد چارتری</div>
              <div className="font-num font-bold text-[#7c3aed]">
                {faDigits(plan.charterSeats)} صندلی
              </div>
            </div>
          </div>

          <label
            htmlFor="plan-price"
            className="mb-1 block text-xs font-bold text-panel-ink"
          >
            نرخ نهایی (تومان)
          </label>
          <div className="mb-3 flex gap-2">
            <input
              id="plan-price"
              dir="ltr"
              value={planPrice}
              onChange={(e) => setPlanPrice(e.target.value)}
              className="font-num h-10 flex-1 rounded-lg border border-panel-border-2 bg-panel-canvas px-2 text-xs outline-none text-panel-ink"
            />
            {plan.aiSuggestion && (
              <button
                onClick={() =>
                  setPlanPrice(
                    irrToTomanInput(String(plan.aiSuggestion!.priceIrr)),
                  )
                }
                className="rounded-lg border border-[#9333ea55] bg-[#9333ea14] px-3 text-[11px] font-bold text-[#7c3aed]"
              >
                استفاده از قیمت AI
              </button>
            )}
          </div>

          <label
            htmlFor="plan-agency"
            className="mb-1 block text-xs font-bold text-panel-ink"
          >
            تخصیص صندلی آژانس (حداکثر {faDigits(maxAgencySeats)})
          </label>
          <input
            id="plan-agency"
            type="range"
            min={0}
            max={maxAgencySeats}
            value={Math.min(agencySeatsNum, maxAgencySeats)}
            onChange={(e) => setPlanAgency(e.target.value)}
            className="mb-2 w-full accent-accent"
          />
          <div className="mb-3 grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-lg bg-panel-canvas p-2.5 text-center">
              <div className="text-[10px] text-panel-muted">چارتری</div>
              <div className="font-num font-bold text-[#7c3aed]">
                {faDigits(plan.charterSeats)}
              </div>
            </div>
            <div className="rounded-lg bg-panel-canvas p-2.5 text-center">
              <div className="text-[10px] text-panel-muted">آژانس</div>
              <div className="font-num font-bold text-[#34d399]">
                {faDigits(agencySeatsNum)}
              </div>
            </div>
            <div className="rounded-lg bg-panel-canvas p-2.5 text-center">
              <div className="text-[10px] text-panel-muted">مستقیم</div>
              <div className="font-num font-bold text-panel-ink">
                {faDigits(directSeats)}
              </div>
            </div>
          </div>
          <div className="mb-3 flex h-2 overflow-hidden rounded bg-panel-surface-2">
            <div
              className="bg-[#7c3aed]"
              style={{
                width: `${plan.capacity > 0 ? (plan.charterSeats / plan.capacity) * 100 : 0}%`,
              }}
            />
            <div
              className="bg-[#34d399]"
              style={{
                width: `${plan.capacity > 0 ? (agencySeatsNum / plan.capacity) * 100 : 0}%`,
              }}
            />
            <div
              className="bg-accent"
              style={{
                width: `${plan.capacity > 0 ? (directSeats / plan.capacity) * 100 : 0}%`,
              }}
            />
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-panel-border">
              <JalaliDatePicker
                label="شروع فروش"
                value={planSaleStart}
                onChange={setPlanSaleStart}
                testId="plan-sale-start"
              />
            </div>
            <div className="rounded-lg border border-panel-border">
              <JalaliDatePicker
                label="پایان فروش"
                value={planSaleEnd}
                onChange={setPlanSaleEnd}
                minDate={planSaleStart ?? undefined}
                testId="plan-sale-end"
              />
            </div>
          </div>

          <button
            onClick={() => void onSubmitPlan()}
            className="w-full rounded-lg bg-accent py-2.5 text-xs font-bold text-white transition hover:bg-accent/90"
          >
            ثبت نرخ و تخصیص صندلی
          </button>

          <div className="mt-5 border-t border-panel-border pt-4">
            <h3 className="mb-2 text-xs font-bold text-panel-ink">
              سهمیه‌های صندلی آژانس‌ها
            </h3>
            {allotments.length === 0 && (
              <p className="mb-2 text-[11px] text-panel-muted">
                هنوز سهمیه‌ای برای این پرواز ثبت نشده است.
              </p>
            )}
            <div className="mb-3 flex flex-col gap-1.5">
              {allotments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg bg-panel-canvas px-2.5 py-2 text-[11px]"
                >
                  <span className="font-bold text-panel-ink">
                    {a.agencyName}
                  </span>
                  <span className="font-num text-panel-muted">
                    {faDigits(a.seatsAllocated)} صندلی
                  </span>
                  <span className="text-[10px] text-panel-muted">
                    {a.type === "SOFT" ? "نرم" : "سخت"}
                  </span>
                  <button
                    onClick={() => void onDeleteAllotment(a.id)}
                    className="text-danger"
                    aria-label={`حذف سهمیه ${a.agencyName}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="آژانس"
                value={newAllotmentAgencyId}
                onChange={(e) => setNewAllotmentAgencyId(e.target.value)}
                className="h-10 min-w-[120px] flex-1 rounded-lg border border-panel-border-2 bg-panel-canvas px-2 text-xs outline-none text-panel-ink"
              >
                <option value="">انتخاب آژانس</option>
                {agencyOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName}
                  </option>
                ))}
              </select>
              <input
                aria-label="تعداد صندلی سهمیه"
                dir="ltr"
                value={newAllotmentSeats}
                onChange={(e) => setNewAllotmentSeats(e.target.value)}
                placeholder="تعداد"
                className="font-num h-10 w-20 rounded-lg border border-panel-border-2 bg-panel-canvas px-2 text-xs outline-none text-panel-ink"
              />
              <select
                aria-label="نوع سهمیه"
                value={newAllotmentType}
                onChange={(e) =>
                  setNewAllotmentType(e.target.value as "HARD" | "SOFT")
                }
                className="h-10 rounded-lg border border-panel-border-2 bg-panel-canvas px-2 text-xs outline-none text-panel-ink"
              >
                <option value="HARD">سخت</option>
                <option value="SOFT">نرم</option>
              </select>
              <input
                aria-label="نرخ قراردادی تومان"
                dir="ltr"
                value={newAllotmentContractToman}
                onChange={(e) => setNewAllotmentContractToman(e.target.value)}
                placeholder="نرخ قرارداد"
                className="font-num h-10 w-24 rounded-lg border border-panel-border-2 bg-panel-canvas px-2 text-xs outline-none text-panel-ink"
              />
              <button
                onClick={() => void onAddAllotment()}
                className="rounded-lg border border-accent px-3 text-[11px] font-bold text-accent"
              >
                + افزودن
              </button>
            </div>
            {newAllotmentType === "SOFT" && (
              <div className="mt-2 max-w-xs rounded-lg border border-panel-border">
                <JalaliDatePicker
                  label="موعد آزادسازی"
                  value={newAllotmentReleaseAt}
                  onChange={setNewAllotmentReleaseAt}
                  testId="allotment-release"
                />
              </div>
            )}
            {allotmentError && (
              <p className="mt-2 text-[11px] text-danger">{allotmentError}</p>
            )}
          </div>

          <FareRulesSection instanceId={plan.id} />
        </Modal>
      )}
      {lifecycleFlight && (
        <FlightLifecycleModal flight={lifecycleFlight} onClose={() => setLifecycleFlight(null)} />
      )}
    </div>
  );
}
