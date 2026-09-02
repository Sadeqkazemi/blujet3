import { useEffect, useMemo, useState } from "react";
import {
  completeScheduledFlight,
  createFareRule,
  fetchAircraftTypes,
  fetchAirports,
  fetchFareRules,
  fetchFlightDefinition,
  resolveScheduleTemplate,
  submitFlightToOperations,
  updateFareRule,
  updateFlightDefinition,
} from "../../api/flights";
import {
  fetchAircraftDefinition,
  fetchAircraftDefinitions,
} from "../../api/aircraft";
import { upsertProposal } from "../../api/pricing";
import { ApiRequestError } from "../../api/envelope";
import JalaliDatePicker from "../../components/JalaliDatePicker";
import MoneyInput from "../../components/MoneyInput";
import TimePicker from "../../components/TimePicker";
import { toFlightCabinKind, type AircraftCabinCapacity } from "../../types/aircraft";
import {
  chargeRuleFromApi,
  draftRulesToApi,
  type DraftChargeRule,
} from "../../lib/charge-rules-adapter";
import {
  formatTomanGrouped,
  moneyInputToRial,
  moneyInputToRialString,
  tomanDigitsOnly,
} from "../../lib/money-input";
import {
  cabinLabel,
  computeArrivalHhMm,
  isValidFlightNo,
  isValidHhMm,
  minutesFromDuration,
  splitDurationMinutes,
  type CabinKind,
} from "../../lib/flight-definition";
import {
  faDigits,
  faMoney,
  irrToTomanInput,
  latinDigits,
} from "../../lib/fa-format";
import { dayjs, isoDateAtNoon, toIsoDateOnly } from "../../lib/jalali";
import { localeMonthYear, localeWeekdayLong } from "../../lib/locale-format";
import type {
  AircraftTypeOption,
  AirportEntry,
  CreateFareRulePayload,
} from "../../types/flights";
import type { ResolvedScheduleTemplate } from "../../types/schedule-templates";
import CabinCapacityEditor, {
  type CabinCapacityRow,
} from "./components/CabinCapacityEditor";
import ChargeRulesEditor from "./components/ChargeRulesEditor";
import DurationFields from "./components/DurationFields";
import FlightNumberInput from "./components/FlightNumberInput";
import AddFlightWizardNav from "./components/AddFlightWizardNav";

type Channel = "SYSTEM" | "CHARTER" | "AGENCY";

interface DraftFare {
  tempId: string;
  cabin: CabinKind;
  cabinLabel: string;
  classCode: string;
  priceIrr: number;
  taxIrr: number;
  seatsAllocated: number;
  baggageAllowanceKg: number;
  refundable: boolean;
  changeable: boolean;
  validFrom: string;
  validUntil: string;
  allowedChannels: Channel[];
}

interface AiSuggestion {
  priceToman: number;
  reason: string;
  factors: string[];
}

const CHANNEL_OPTS: { key: Channel; label: string }[] = [
  { key: "SYSTEM", label: "سیستمی" },
  { key: "CHARTER", label: "چارتری" },
  { key: "AGENCY", label: "آژانس" },
];

const ISO_WEEKDAY_LABELS: Record<number, string> = {
  1: "دوشنبه",
  2: "سه‌شنبه",
  3: "چهارشنبه",
  4: "پنجشنبه",
  5: "جمعه",
  6: "شنبه",
  7: "یکشنبه",
};

const COMPLETABLE_OCCURRENCE_STATUSES = new Set([
  "DRAFT",
  "REJECTED",
  "OPERATIONS_REJECTED",
]);

const inputClass =
  "w-full box-border h-11 rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-[13px] text-[#e7ecf3] outline-none";
const labelClass = "mb-[7px] block text-[11.5px] text-[#9fb0c7]";

function emptyFareForm() {
  return {
    cabin: "ECONOMY" as CabinKind,
    classCode: "",
    priceToman: "",
    taxMode: "FIXED" as "FIXED" | "PERCENTAGE",
    taxToman: "0",
    taxPercent: "",
    seatsAllocated: "",
    baggageKg: "",
    refundable: true,
    changeable: true,
    validFrom: null as string | null,
    validUntil: null as string | null,
    allowedChannels: [] as Channel[],
  };
}

function defaultCabinRows(): CabinCapacityRow[] {
  return [{ key: "cab-init", cabin: "ECONOMY", seats: "" }];
}

function buildDepartureIso(
  dateIso: string | null,
  timeHhMm: string,
): string | null {
  if (!dateIso || !isValidHhMm(timeHhMm)) return null;
  const day = dateIso.slice(0, 10);
  const [h, m] = timeHhMm.split(":").map(Number);
  return dayjs(`${day}T00:00:00`)
    .hour(h!)
    .minute(m!)
    .second(0)
    .millisecond(0)
    .toISOString();
}

/** Design-matching heuristic when ML is unavailable (design mock fallback). */
function suggestPriceHeuristic(opts: {
  baseToman: number;
  compToman: number;
  capacity: number;
  charter: number;
  dateIso: string | null;
  routeLabel: string;
}): AiSuggestion {
  const { baseToman, compToman, capacity, charter, dateIso, routeLabel } = opts;
  let m = 4;
  if (dateIso) {
    m = dayjs(dateIso).calendar("jalali").month() + 1;
  }
  const season =
    m >= 4 && m <= 6
      ? { n: "تابستان", d: 1.1, t: "تعطیلات تابستانهٔ مدارس و اوج سفرها" }
      : m >= 1 && m <= 3
        ? { n: "بهار", d: 1.0, t: "سفرهای بهاری" }
        : m >= 7 && m <= 9
          ? { n: "پاییز", d: 0.95, t: "کاهش تدریجی تقاضا" }
          : { n: "زمستان", d: 1.05, t: "تعطیلات پایان سال" };
  const occ =
    m === 1
      ? { b: 0.12, t: "تعطیلات نوروز" }
      : m === 4 || m === 5
        ? { b: 0.06, t: "تعطیلات تابستانهٔ مدارس" }
        : m === 12
          ? { b: 0.07, t: "تعطیلات پایان سال" }
          : routeLabel.includes("نجف")
            ? { b: 0.08, t: "ایام زیارتی مذهبی" }
            : { b: 0, t: "بدون مناسبت خاص" };
  const chPct = capacity > 0 ? Math.round((charter / capacity) * 100) : 0;
  const df = season.d + occ.b + (chPct >= 50 ? 0.05 : chPct >= 30 ? 0.02 : 0);
  const high = df >= 1.12;
  const ref = compToman || baseToman || 0;
  const target = Math.round(
    ((ref * (high ? 1.02 : 0.98) * (1 + (df - 1) * 0.5)) / 50_000) * 50_000,
  );
  return {
    priceToman: target,
    reason: `با توجه به فصل «${season.n}» (${season.t}) و ${
      occ.b > 0 ? `مناسبت «${occ.t}»، ` : "نبود مناسبت خاص، "
    }سطح تقاضا ${high ? "بالا" : "متوسط"} برآورد می‌شود؛ ${
      high
        ? "قیمت هم‌تراز یا کمی بالاتر از رقبا برای بیشینه‌سازی درآمد."
        : "قیمت اندکی پایین‌تر از رقبا برای جذب تقاضا."
    }`,
    factors: [
      `فصل: ${season.n} — ${season.t}`,
      `تعطیلات/مناسبت: ${occ.t}`,
      `قیمت رقبا: ${faMoney((compToman || 0) * 10)} تومان`,
      `تعهد چارتری: ${faDigits(charter)} از ${faDigits(capacity)} صندلی (${faDigits(chPct)}٪)`,
      `ضریب تقاضای فصلی/مناسبتی: ×${faDigits(Math.round(df * 100) / 100)}`,
    ],
  };
}

export interface AddFlightPageProps {
  onClose: () => void;
  onSuccess: (message: string) => void;
  mode?: "create" | "edit";
  flightId?: string;
}

export default function AddFlightPage({
  onClose,
  onSuccess,
  mode = "create",
  flightId,
}: AddFlightPageProps) {
  const isEdit = mode === "edit" && Boolean(flightId);

  const [airports, setAirports] = useState<AirportEntry[]>([]);
  const [aircraftTypes, setAircraftTypes] = useState<AircraftTypeOption[]>([]);
  const [loadingDefinition, setLoadingDefinition] = useState(isEdit);
  const [operationsFeedback, setOperationsFeedback] = useState<string | null>(
    null,
  );

  const [flightNo, setFlightNo] = useState("");
  const [originCode, setOriginCode] = useState("");
  const [destCode, setDestCode] = useState("");
  const [cityOpen, setCityOpen] = useState<"origin" | "dest" | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [dateIso, setDateIso] = useState<string | null>(null);
  const [time, setTime] = useState("");
  const [durationHours, setDurationHours] = useState(0);
  const [durationMins, setDurationMins] = useState(0);
  const [aircraft, setAircraft] = useState("Airbus A320");
  const [cabinRows, setCabinRows] =
    useState<CabinCapacityRow[]>(defaultCabinRows);
  const [aircraftCabinLimits, setAircraftCabinLimits] = useState<AircraftCabinCapacity[]>([]);
  const [charter, setCharter] = useState("");
  const [resolvedTemplate, setResolvedTemplate] =
    useState<ResolvedScheduleTemplate | null>(null);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<
    string | null
  >(null);
  const [resolvedOccurrenceVersion, setResolvedOccurrenceVersion] = useState<
    number | null
  >(null);
  const [routeResolving, setRouteResolving] = useState(false);
  const [chargeRules, setChargeRules] = useState<DraftChargeRule[]>([]);

  const [fares, setFares] = useState<DraftFare[]>([]);
  const [fareFormOpen, setFareFormOpen] = useState(false);
  const [fareEditingId, setFareEditingId] = useState<string | null>(null);
  const [fareForm, setFareForm] = useState(emptyFareForm());
  const [fareError, setFareError] = useState<string | null>(null);

  const [baseToman, setBaseToman] = useState("");
  const [compToman, setCompToman] = useState("");
  const [proposedToman, setProposedToman] = useState("");
  const [legalToman, setLegalToman] = useState("");
  const [ceoNote, setCeoNote] = useState("");
  const [operationsNote, setOperationsNote] = useState("");
  const [commercialNote, setCommercialNote] = useState("");
  const [ai, setAi] = useState<AiSuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);

  const todayIso = useMemo(() => isoDateAtNoon(toIsoDateOnly(dayjs())), []);

  const dateMin = useMemo(() => {
    if (!isEdit) return todayIso;
    if (!dateIso) return todayIso;
    const flightDay = dateIso.slice(0, 10);
    const todayDay = todayIso.slice(0, 10);
    return flightDay >= todayDay ? todayIso : undefined;
  }, [isEdit, dateIso, todayIso]);

  const durationMinutes = minutesFromDuration(durationHours, durationMins);
  const arrival = computeArrivalHhMm(time, durationMinutes ?? 0) ?? "";

  const capacity = useMemo(
    () =>
      cabinRows.reduce(
        (acc, row) => acc + (Number(latinDigits(row.seats)) || 0),
        0,
      ),
    [cabinRows],
  );
  const availableFareCabins = useMemo(
    () => {
      const definedCabins = new Set(
        aircraftCabinLimits
          .filter((row) => row.capacity > 0)
          .map((row) => toFlightCabinKind(row.cabinType))
          .filter((row): row is CabinKind => row !== null),
      );
      return cabinRows
        .filter((row) => (Number(latinDigits(row.seats)) || 0) > 0)
        .filter((row) => definedCabins.size === 0 || definedCabins.has(row.cabin))
        .map((row) => row.cabin);
    },
    [aircraftCabinLimits, cabinRows],
  );
  const inheritedOccurrenceLocked =
    !isEdit &&
    Boolean(
      selectedOccurrenceId &&
      resolvedOccurrenceVersion != null,
    );
  const selectedOccurrence = resolvedTemplate?.occurrences.find(
    (occurrence) => occurrence.id === selectedOccurrenceId,
  );

  const basePriceIrr = moneyInputToRialString(baseToman) ?? "0";
  const fareAdultToman = BigInt(tomanDigitsOnly(fareForm.priceToman) || "0");
  const fareIsCharterOnly =
    fareForm.allowedChannels.includes("CHARTER") &&
    !fareForm.allowedChannels.includes("SYSTEM");
  const infantFareToman = formatTomanGrouped(
    ((fareAdultToman * 1_000n) / 10_000n).toString(),
  );
  const childFareToman = formatTomanGrouped(
    (
      (fareAdultToman * (fareIsCharterOnly ? 10_000n : 5_000n)) /
      10_000n
    ).toString(),
  );

  const cabinCapacityError = useMemo(() => {
    if (!showValidation) return null;
    const seats = cabinRows.map((r) => Number(latinDigits(r.seats)) || 0);
    if (!seats.some((s) => s > 0))
      return "حداقل یک کابین با صندلی بیشتر از صفر لازم است";
    const cabins = cabinRows.map((r) => r.cabin);
    if (new Set(cabins).size !== cabins.length) return "کابین تکراری مجاز نیست";
    for (const row of cabinRows) {
      const maximum = aircraftCabinLimits.find(
        (candidate) => candidate.cabinType === row.cabin,
      )?.capacity;
      const configured = Number(latinDigits(row.seats)) || 0;
      if (maximum == null) return `کابین ${cabinLabel(row.cabin)} در هواپیمای انتخابی وجود ندارد`;
      if (configured > maximum)
        return `ظرفیت ${cabinLabel(row.cabin)} نمی‌تواند بیشتر از ${faDigits(maximum)} صندلی باشد`;
    }
    return null;
  }, [aircraftCabinLimits, cabinRows, showValidation]);

  useEffect(() => {
    fetchAirports()
      .then(setAirports)
      .catch(() => setAirports([]));
    fetchAircraftTypes()
      .then((list) => {
        setAircraftTypes(list);
        if (
          list.length > 0 &&
          !list.some((a) => a.aircraftType === "Airbus A320")
        ) {
          setAircraft(list[0]!.aircraftType);
        }
      })
      .catch(() => setAircraftTypes([]));
  }, []);

  useEffect(() => {
    if (!isEdit || !flightId) return;
    setLoadingDefinition(true);
    fetchFlightDefinition(flightId)
      .then((def) => {
        setFlightNo(def.flightNo);
        setOriginCode(def.originCode);
        setDestCode(def.destCode);
        const dep = dayjs(def.departureAt);
        setDateIso(isoDateAtNoon(toIsoDateOnly(dep)));
        setTime(dep.format("HH:mm"));
        const split = splitDurationMinutes(def.durationMinutes);
        setDurationHours(split.hours);
        setDurationMins(split.minutes);
        setCabinRows(
          def.cabinCapacities.length > 0
            ? def.cabinCapacities.map((c, i) => ({
                key: `cab-${i}`,
                cabin: c.cabin,
                seats: String(c.seats),
              }))
            : defaultCabinRows(),
        );
        setAircraftCabinLimits(
          def.cabinCapacities.map((c) => ({
            cabinType: c.cabin,
            capacity: c.seats,
          })),
        );
        setCharter(String(def.charterSeats ?? 0));
        setAircraft(def.aircraftType || "Airbus A320");
        setChargeRules(def.chargeRules.map(chargeRuleFromApi));
        setOperationsFeedback(
          def.definitionStatus === "OPERATIONS_REJECTED"
            ? def.rejectionReason
            : null,
        );
        if (def.basePriceIrr) {
          setBaseToman(formatTomanGrouped(irrToTomanInput(def.basePriceIrr)));
        }
        if (def.pricingProposal) {
          setProposedToman(
            formatTomanGrouped(
              irrToTomanInput(def.pricingProposal.proposedPriceIrr),
            ),
          );
          if (def.pricingProposal.legalRateIrr) {
            setLegalToman(
              formatTomanGrouped(
                irrToTomanInput(def.pricingProposal.legalRateIrr),
              ),
            );
          }
          setCeoNote(def.pricingProposal.ceoNote ?? "");
          setOperationsNote(def.pricingProposal.operationsNote ?? "");
          setCommercialNote(def.pricingProposal.commercialNote ?? "");
        }
        return fetchFareRules(flightId).then((fareRules) => {
          setFares(
            fareRules.map((rule) => ({
              tempId: rule.id,
              cabin: rule.cabin,
              cabinLabel: cabinLabel(rule.cabin),
              classCode: rule.classCode,
              priceIrr: Number(rule.priceIrr),
              taxIrr: Number(rule.taxIrr),
              seatsAllocated: rule.seatsAllocated,
              baggageAllowanceKg: rule.baggageAllowanceKg ?? 0,
              refundable: rule.refundable,
              changeable: rule.changeable,
              validFrom: rule.validFrom ?? "",
              validUntil: rule.validUntil ?? "",
              allowedChannels: [...rule.allowedChannels],
            })),
          );
        });
      })
      .catch((e) => {
        setError(
          e instanceof ApiRequestError
            ? e.message
            : e instanceof Error
              ? e.message
              : "خطا در بارگذاری پرواز.",
        );
      })
      .finally(() => setLoadingDefinition(false));
  }, [isEdit, flightId]);

  useEffect(() => {
    if (isEdit || !isValidFlightNo(flightNo)) {
      if (!isEdit) {
        setResolvedTemplate(null);
        setSelectedOccurrenceId(null);
        setResolvedOccurrenceVersion(null);
      }
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setRouteResolving(true);
      resolveScheduleTemplate(flightNo)
        .then(async (template) => {
          if (cancelled) return;
          setResolvedTemplate(template);
          if (template.originCode) setOriginCode(template.originCode);
          if (template.destCode) setDestCode(template.destCode);
          setTime(template.departureTime);
          const duration = splitDurationMinutes(template.durationMinutes);
          setDurationHours(duration.hours);
          setDurationMins(duration.minutes);
          if (template.aircraftCode) setAircraft(template.aircraftCode);
          if (template.agencyPriceIrr) {
            setBaseToman(
              formatTomanGrouped(irrToTomanInput(template.agencyPriceIrr)),
            );
          }
          if (template.legalCeilingIrr) {
            setLegalToman(
              formatTomanGrouped(irrToTomanInput(template.legalCeilingIrr)),
            );
          }
          if (template.cabinCapacities.length > 0) {
            setAircraftCabinLimits(
              template.cabinCapacities.map((row) => ({
                cabinType: row.cabin,
                capacity: row.seats,
              })),
            );
            setCabinRows(
              template.cabinCapacities.map((row, index) => ({
                key: `template-cabin-${index}`,
                cabin: row.cabin,
                seats: String(row.seats),
              })),
            );
          }
          const initialOccurrence =
            template.occurrences.find(
              (occurrence) =>
                occurrence.id === template.nextFlightInstanceId &&
                COMPLETABLE_OCCURRENCE_STATUSES.has(
                  occurrence.definitionStatus,
                ),
            ) ??
            template.occurrences.find((occurrence) =>
              COMPLETABLE_OCCURRENCE_STATUSES.has(
                occurrence.definitionStatus,
              ),
            );
          setSelectedOccurrenceId(initialOccurrence?.id ?? null);
          if (initialOccurrence) {
            const departure = dayjs(initialOccurrence.departureAt);
            setDateIso(isoDateAtNoon(toIsoDateOnly(departure)));
            setTime(departure.format("HH:mm"));
          }
          if (initialOccurrence) {
            const [definition, aircraftDefinition] = await Promise.all([
              fetchFlightDefinition(initialOccurrence.id),
              fetchAircraftDefinition(template.aircraftDefinitionId).catch(() => null),
            ]);
            if (!cancelled) {
              setResolvedOccurrenceVersion(definition.version);
              if (aircraftDefinition) {
                setAircraftCabinLimits(
                  aircraftDefinition.cabins
                    .filter((row) => row.capacity > 0)
                    .map((row) => ({
                      cabinType: row.cabinType,
                      capacity: row.capacity,
                    })),
                );
              }
            }
          } else {
            setResolvedOccurrenceVersion(null);
          }
        })
        .catch((cause) => {
          if (cancelled) return;
          setResolvedTemplate(null);
          setSelectedOccurrenceId(null);
          setResolvedOccurrenceVersion(null);
          if (!(cause instanceof ApiRequestError) || cause.status !== 404) {
            setError(
              cause instanceof Error
                ? cause.message
                : "خطا در دریافت اطلاعات مسیر پرواز.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setRouteResolving(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [flightNo, isEdit]);

  async function chooseOccurrence(occurrenceId: string) {
    const occurrence = resolvedTemplate?.occurrences.find(
      (candidate) => candidate.id === occurrenceId,
    );
    if (
      !occurrence ||
      !COMPLETABLE_OCCURRENCE_STATUSES.has(occurrence.definitionStatus)
    ) {
      return;
    }
    setRouteResolving(true);
    setError(null);
    try {
      const definition = await fetchFlightDefinition(occurrence.id);
      const departure = dayjs(occurrence.departureAt);
      setSelectedOccurrenceId(occurrence.id);
      setResolvedOccurrenceVersion(definition.version);
      setDateIso(isoDateAtNoon(toIsoDateOnly(departure)));
      setTime(departure.format("HH:mm"));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "خطا در دریافت رخداد انتخاب‌شده.",
      );
    } finally {
      setRouteResolving(false);
    }
  }

  async function applyAircraftDefinition(type: string) {
    setAircraft(type);
    try {
      const list = await fetchAircraftDefinitions();
      const match = list.find(
        (d) =>
          d.model === type ||
          d.code === type ||
          d.title === type ||
          d.model.toLowerCase() === type.toLowerCase(),
      );
      if (!match) throw new Error("NO_DEFINITION");
      const detail = await fetchAircraftDefinition(match.id);
      setAircraftCabinLimits(
        detail.cabins
          .filter((c) => c.capacity > 0)
          .map((c) => ({ cabinType: c.cabinType, capacity: c.capacity })),
      );
      const rows: CabinCapacityRow[] = [];
      for (const c of detail.cabins) {
        if (c.capacity <= 0) continue;
        const mapped = toFlightCabinKind(c.cabinType);
        if (!mapped) continue;
        if (rows.some((r) => r.cabin === mapped)) continue;
        rows.push({
          key: `cab-${mapped}`,
          cabin: mapped,
          seats: String(c.capacity),
        });
      }
      if (rows.length > 0) {
        setCabinRows(rows);
        const capacityByCabin = new Map(
          rows.map((row) => [row.cabin, Number(latinDigits(row.seats)) || 0]),
        );
        setFares((current) => {
          const kept = current.filter((fare) => {
            const cabinCapacity = capacityByCabin.get(fare.cabin);
            return cabinCapacity != null && fare.seatsAllocated <= cabinCapacity;
          });
          if (kept.length !== current.length) {
            setFareEditingId(null);
            setFareFormOpen(false);
            setError(
              "کلاس‌های نرخی ناسازگار با ظرفیت هواپیمای جدید حذف شدند؛ آن‌ها را بر اساس کابین‌های همین هواپیما دوباره تعریف کنید.",
            );
          }
          return kept;
        });
      }
    } catch {
      const match = aircraftTypes.find((a) => a.aircraftType === type);
      if (match && match.capacity > 0) {
        setAircraftCabinLimits([{ cabinType: "ECONOMY", capacity: match.capacity }]);
        setCabinRows([
          { key: "cab-auto", cabin: "ECONOMY", seats: String(match.capacity) },
        ]);
        setFares((current) =>
          current.filter(
            (fare) =>
              fare.cabin === "ECONOMY" &&
              fare.seatsAllocated <= match.capacity,
          ),
        );
      }
    }
  }

  const cityByCode = useMemo(
    () => new Map(airports.map((a) => [a.code, a.cityFa])),
    [airports],
  );

  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    if (!q) return airports;
    return airports.filter(
      (a) =>
        a.cityFa.includes(cityQuery.trim()) ||
        a.code.toLowerCase().includes(q) ||
        a.airportNameFa?.includes(cityQuery.trim()),
    );
  }, [airports, cityQuery]);

  function originLabel() {
    if (!originCode) return "انتخاب شهر مبدأ";
    return `${cityByCode.get(originCode) ?? originCode} (${originCode})`;
  }
  function destLabel() {
    if (!destCode) return "انتخاب شهر مقصد";
    return `${cityByCode.get(destCode) ?? destCode} (${destCode})`;
  }

  function openFareCreate() {
    setFareEditingId(null);
    setFareForm({
      ...emptyFareForm(),
      cabin: availableFareCabins[0] ?? "ECONOMY",
    });
    setFareError(null);
    setFareFormOpen(true);
  }

  function openFareEdit(f: DraftFare) {
    setFareEditingId(f.tempId);
    setFareForm({
      cabin: f.cabin,
      classCode: f.classCode,
      priceToman: formatTomanGrouped(String(Math.round(f.priceIrr / 10))),
      taxMode: "FIXED" as const,
      taxToman: formatTomanGrouped(String(Math.round(f.taxIrr / 10))),
      taxPercent: "",
      seatsAllocated: String(f.seatsAllocated),
      baggageKg: f.baggageAllowanceKg ? String(f.baggageAllowanceKg) : "",
      refundable: f.refundable,
      changeable: f.changeable,
      validFrom: f.validFrom || null,
      validUntil: f.validUntil || null,
      allowedChannels: [...f.allowedChannels],
    });
    setFareError(null);
    setFareFormOpen(true);
  }

  function saveFareDraft() {
    setFareError(null);
    const priceIrr = moneyInputToRial(fareForm.priceToman);
    let taxIrr = 0;
    if (fareForm.taxMode === "PERCENTAGE") {
      const percent = Number(latinDigits(fareForm.taxPercent).replace(",", "."));
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        setFareError("درصد مالیات و عوارض باید بین ۰ تا ۱۰۰ باشد");
        return;
      }
      taxIrr = Math.round((priceIrr ?? 0) * percent / 100);
    } else {
      taxIrr = moneyInputToRial(fareForm.taxToman) ?? 0;
    }
    const seats = Number(latinDigits(fareForm.seatsAllocated));
    if (!fareForm.classCode.trim()) {
      setFareError("کد کلاس نرخی را وارد کنید");
      return;
    }
    if (priceIrr == null || priceIrr <= 0) {
      setFareError("قیمت پایه را وارد کنید");
      return;
    }
    if (!Number.isInteger(seats) || seats <= 0) {
      setFareError("ظرفیت اختصاصی را وارد کنید");
      return;
    }
    if (
      fareForm.validFrom &&
      fareForm.validUntil &&
      fareForm.validUntil.slice(0, 10) <= fareForm.validFrom.slice(0, 10)
    ) {
      setFareError("تاریخ پایان اعتبار باید بعد از تاریخ شروع باشد");
      return;
    }
    const excludeId = fareEditingId;
    const others = fares.filter(
      (r) => r.cabin === fareForm.cabin && r.tempId !== excludeId,
    );
    const allocatedSum =
      others.reduce((a, b) => a + b.seatsAllocated, 0) + seats;
    const selectedCabinCapacity =
      Number(
        latinDigits(
          cabinRows.find((row) => row.cabin === fareForm.cabin)?.seats ?? "0",
        ),
      ) || 0;
    if (selectedCabinCapacity <= 0) {
      setFareError(
        `کابین ${cabinLabel(fareForm.cabin)} در هواپیمای این رخداد ظرفیت فعال ندارد`,
      );
      return;
    }
    if (allocatedSum > selectedCabinCapacity) {
      setFareError(
        `مجموع ظرفیت کلاس‌های ${cabinLabel(fareForm.cabin)} از ظرفیت فیزیکی همان کابین (${faDigits(selectedCabinCapacity)}) بیشتر است`,
      );
      return;
    }
    const rec: DraftFare = {
      tempId: excludeId ?? `tmp-${Date.now()}`,
      cabin: fareForm.cabin,
      cabinLabel: cabinLabel(fareForm.cabin),
      classCode: latinDigits(fareForm.classCode.trim()).toUpperCase(),
      priceIrr,
      taxIrr,
      seatsAllocated: seats,
      baggageAllowanceKg: fareForm.baggageKg
        ? Number(latinDigits(fareForm.baggageKg))
        : 0,
      refundable: fareForm.refundable,
      changeable: fareForm.changeable,
      validFrom: fareForm.validFrom ?? "",
      validUntil: fareForm.validUntil ?? "",
      allowedChannels: [...fareForm.allowedChannels],
    };
    setFares((list) => [...list.filter((x) => x.tempId !== rec.tempId), rec]);
    setFareFormOpen(false);
    setFareEditingId(null);
  }

  function runAi() {
    const comp = Number(tomanDigitsOnly(compToman));
    if (!comp || comp <= 0) {
      setError("برای تحلیل، قیمت رقبا را وارد کنید");
      return;
    }
    setError(null);
    setAiLoading(true);
    const suggestion = suggestPriceHeuristic({
      baseToman: Number(tomanDigitsOnly(baseToman)) || 0,
      compToman: comp,
      capacity: capacity || 180,
      charter: Number(latinDigits(charter)) || 0,
      dateIso,
      routeLabel: `${cityByCode.get(originCode) ?? originCode} ← ${cityByCode.get(destCode) ?? destCode}`,
    });
    setAi(suggestion);
    setProposedToman(formatTomanGrouped(String(suggestion.priceToman)));
    setAiLoading(false);
  }

  async function onSubmit() {
    setShowValidation(true);
    setError(null);

    // FlightNumberInput already uppercases; do not trim — leading/trailing
    // spaces must fail validation (same as backend ^[A-Z]{2}\d{4}$).
    const no = flightNo;
    const charterSeats = isEdit ? Number(latinDigits(charter)) || 0 : 0;
    const proposedIrr = moneyInputToRialString(proposedToman);
    const baseIrr = moneyInputToRialString(baseToman) ?? proposedIrr;
    const compIrr = moneyInputToRialString(compToman);

    if (!isValidFlightNo(no)) {
      setError("شماره پرواز معتبر نیست (مثال: XY1234)");
      return;
    }
    if (!isEdit && routeResolving) {
      setError("در حال دریافت رخداد مسیر پروازی؛ چند لحظه صبر کنید.");
      return;
    }
    if (
      !isEdit &&
      (!selectedOccurrenceId ||
        !selectedOccurrence ||
        !COMPLETABLE_OCCURRENCE_STATUSES.has(
          selectedOccurrence.definitionStatus,
        ) ||
        resolvedOccurrenceVersion == null)
    ) {
      setError(
        "ابتدا شماره یک مسیر پروازی فعال را وارد کنید؛ افزودن پرواز فقط با تکمیل رخداد زمان‌بندی‌شده انجام می‌شود.",
      );
      return;
    }
    if (
      !originCode ||
      !destCode ||
      !dateIso ||
      !time ||
      durationMinutes == null ||
      proposedIrr == null
    ) {
      setError(
        "موارد الزامی (شماره، مسیر، تاریخ، ساعت، مدت، نرخ پیشنهادی) را کامل کنید",
      );
      return;
    }
    if (!isValidHhMm(time)) {
      setError("ساعت پرواز را به صورت HH:mm وارد کنید.");
      return;
    }
    if (originCode === destCode) {
      setError("مبدأ و مقصد نمی‌توانند یکسان باشند.");
      return;
    }
    if (capacity <= 0 || cabinCapacityError) {
      setError(cabinCapacityError ?? "ظرفیت کابین‌ها را وارد کنید");
      return;
    }
    if (charterSeats >= capacity) {
      setError("تعهد چارتری باید کمتر از تعداد صندلی موجود باشد.");
      return;
    }
    if (fares.length === 0) {
      setError(
        "پیش از ارسال برای مدیر عملیات، حداقل یک کلاس نرخی و ظرفیت فروش آن را تعریف کنید.",
      );
      return;
    }

    const departureAt = buildDepartureIso(dateIso, time);
    if (!departureAt) {
      setError("تاریخ و ساعت پرواز معتبر نیست.");
      return;
    }

    const cabinCapacities = cabinRows
      .map((r) => ({
        cabin: r.cabin,
        seats: Number(latinDigits(r.seats)) || 0,
      }))
      .filter((c) => c.seats > 0);

    const payload = {
      originCode,
      destCode,
      flightNo: no,
      departureAt,
      durationMinutes,
      capacity,
      cabinCapacities,
      basePriceIrr: baseIrr!,
      aircraftType: aircraft || undefined,
      charterSeats: charterSeats,
      chargeRules: draftRulesToApi(chargeRules),
      competitorPriceIrr: compIrr ?? undefined,
    };

    setSaving(true);
    try {
      if (!isEdit) {
        const targetFlightId = selectedOccurrenceId!;
        const legalIrr = moneyInputToRialString(legalToman);
        await completeScheduledFlight(targetFlightId, {
          expectedVersion: resolvedOccurrenceVersion!,
          basePriceIrr: baseIrr!,
          competitorPriceIrr: compIrr ?? undefined,
          charterSeats,
          chargeRules: draftRulesToApi(chargeRules),
          fareRules: fares.map((fare) => ({
            cabin: fare.cabin,
            classCode: fare.classCode,
            priceIrr: String(fare.priceIrr),
            seatsAllocated: fare.seatsAllocated,
            taxIrr: String(fare.taxIrr),
            refundable: fare.refundable,
            changeable: fare.changeable,
            baggageAllowanceKg: fare.baggageAllowanceKg || undefined,
            allowedChannels: fare.allowedChannels.length
              ? fare.allowedChannels
              : undefined,
            validFrom: fare.validFrom || undefined,
            validUntil: fare.validUntil || undefined,
          })),
          pricingProposal: {
            proposedPriceIrr: proposedIrr,
            legalRateIrr: legalIrr ?? undefined,
            ceoNote: ceoNote.trim() || undefined,
            operationsNote: operationsNote.trim() || undefined,
            commercialNote: commercialNote.trim() || undefined,
          },
        });
        const route = `${cityByCode.get(originCode) ?? originCode} ← ${cityByCode.get(destCode) ?? destCode}`;
        const occurrenceCount = resolvedTemplate?.occurrences.filter((occurrence) =>
          COMPLETABLE_OCCURRENCE_STATUSES.has(occurrence.definitionStatus),
        ).length ?? 1;
        onSuccess(
          `هر ${faDigits(occurrenceCount)} روز پرواز این شماره در یک عملیات برای بررسی مدیر عملیات ارسال شد ✓ — ${route}`,
        );
        return;
      }

      if (flightId) {
        const targetFlightId = flightId;
        const updated = await updateFlightDefinition(targetFlightId, payload);

        const existingFareRules = await fetchFareRules(targetFlightId).catch(
          () => [],
        );
        for (const f of fares) {
          const farePayload: CreateFareRulePayload = {
            cabin: f.cabin,
            classCode: f.classCode,
            priceIrr: f.priceIrr,
            seatsAllocated: f.seatsAllocated,
            taxIrr: f.taxIrr,
            refundable: f.refundable,
            changeable: f.changeable,
            baggageAllowanceKg: f.baggageAllowanceKg || undefined,
            allowedChannels: f.allowedChannels.length
              ? f.allowedChannels
              : undefined,
            validFrom: f.validFrom || undefined,
            validUntil: f.validUntil || undefined,
          };
          const existingFare = existingFareRules.find(
            (rule) => rule.cabin === f.cabin && rule.classCode === f.classCode,
          );
          if (existingFare) {
            await updateFareRule(targetFlightId, existingFare.id, {
              priceIrr: farePayload.priceIrr,
              seatsAllocated: farePayload.seatsAllocated,
              taxIrr: farePayload.taxIrr,
              refundable: farePayload.refundable,
              changeable: farePayload.changeable,
              baggageAllowanceKg: farePayload.baggageAllowanceKg,
              allowedChannels: farePayload.allowedChannels,
              validFrom: farePayload.validFrom,
              validUntil: farePayload.validUntil,
            });
          } else {
            await createFareRule(targetFlightId, farePayload);
          }
        }

        const legalIrr = moneyInputToRialString(legalToman);
        await upsertProposal(targetFlightId, {
          proposedPriceIrr: proposedIrr,
          legalRateIrr: legalIrr ?? undefined,
          ceoNote: ceoNote.trim() || undefined,
          operationsNote: operationsNote.trim() || undefined,
          commercialNote: commercialNote.trim() || undefined,
        });
        await submitFlightToOperations(targetFlightId, updated.version);
        const route = `${cityByCode.get(originCode) ?? originCode} ← ${cityByCode.get(destCode) ?? destCode}`;
        onSuccess(
          updated.pendingRevision ||
            updated.approvalStatus === "PENDING_REVISION"
            ? "تغییرات برای بررسی مجدد مدیر عملیات ارسال شد."
            : `مشخصات پرواز برای بررسی مدیر عملیات ارسال شد ✓ — ${route}`,
        );
        return;
      }
      setError("شناسه پرواز برای ویرایش موجود نیست.");
    } catch (e) {
      const message =
        e instanceof ApiRequestError
          ? e.message
          : e instanceof Error
            ? e.message
            : "خطا در ثبت پرواز.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  const pageTitle = isEdit ? "ویرایش مشخصات پرواز" : "افزودن پرواز جدید";
  const submitLabel = isEdit
    ? saving
      ? "در حال ذخیره…"
      : "ذخیره تغییرات"
    : saving
      ? "در حال ثبت…"
      : "ثبت پرواز و ارسال برای مدیر عملیات";

  function goToNextStep() {
    setError(null);
    if (wizardStep === 0) {
      if (
        !isValidFlightNo(flightNo) ||
        !selectedOccurrenceId ||
        !selectedOccurrence ||
        !COMPLETABLE_OCCURRENCE_STATUSES.has(
          selectedOccurrence.definitionStatus,
        ) ||
        resolvedOccurrenceVersion == null
      ) {
        setError(
          "برای ادامه، شماره یک مسیر پروازی فعال را وارد و منتظر تکمیل خودکار مشخصات بمانید.",
        );
        return;
      }
    }
    if (wizardStep === 1 && fares.length === 0) {
      setError("حداقل یک کلاس نرخی و ظرفیت فروش آن را تعریف کنید.");
      return;
    }
    setWizardStep((step) => Math.min(2, step + 1));
  }

  return (
    <div
      className="fixed inset-0 z-[120] overflow-y-auto bg-[#0b1220]"
      data-testid="add-flight-page"
    >
      <div className="mx-auto max-w-[940px] px-[22px] pb-[60px] pt-[26px]">
        <div className="mb-[22px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="بازگشت"
              className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] border border-[#24304a] bg-[#141d2e] text-[#9fb0c7]"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            <div>
              <h1 className="m-0 text-xl font-black text-white">{pageTitle}</h1>
              <p className="mt-[3px] text-xs text-[#6b7b94]">
                {isEdit
                  ? "مشخصات پرواز را ویرایش کنید؛ تغییرات ابتدا برای بررسی مدیر عملیات ارسال می‌شود."
                  : "شماره یک مسیر پروازی فعال را وارد کنید؛ مشخصات فیزیکی همان رخداد تکمیل می‌شود و سپس نرخ و ظرفیت فروش را تعیین می‌کنید."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#3b82f6] px-[18px] py-[9px] text-[12.5px] font-bold text-[#3b82f6]"
          >
            انصراف
          </button>
        </div>

        {loadingDefinition ? (
          <p className="py-8 text-center text-sm text-[#9fb0c7]">
            در حال بارگذاری مشخصات پرواز…
          </p>
        ) : (
          <>
            {operationsFeedback && (
              <div className="mb-4 rounded-xl border border-[#f8717155] bg-[#f8717114] p-4 text-sm leading-7 text-[#fca5a5]">
                <strong className="block text-xs text-[#f87171]">
                  نظر مدیر عملیات برای اصلاح
                </strong>
                {operationsFeedback}
              </div>
            )}
            {!isEdit && (
              <AddFlightWizardNav
                activeStep={wizardStep}
                onStep={(step) => {
                  if (step <= wizardStep) setWizardStep(step);
                }}
              />
            )}
            {/* مشخصات پرواز */}
            <section
              className={`${!isEdit && wizardStep !== 0 ? "hidden" : ""} mb-[15px] rounded-2xl border border-[#1f2a3d] bg-[#141d2e] px-[19px] py-[18px]`}
            >
              <div className="mb-4 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#3b82f6]" />
                <h2 className="m-0 text-[14.5px] font-extrabold text-white">
                  مشخصات پرواز
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-[13px] md:grid-cols-3">
                <FlightNumberInput
                  value={flightNo}
                  onChange={(value) => {
                    setFlightNo(value);
                    if (
                      resolvedTemplate &&
                      value !== resolvedTemplate.flightNoBase
                    ) {
                      setResolvedTemplate(null);
                      setSelectedOccurrenceId(null);
                      setResolvedOccurrenceVersion(null);
                    }
                  }}
                  showError={showValidation}
                />
                <div className="relative">
                  <span className={labelClass}>مبدأ *</span>
                  <button
                    type="button"
                    disabled={inheritedOccurrenceLocked}
                    onClick={() => {
                      setCityOpen(cityOpen === "origin" ? null : "origin");
                      setCityQuery("");
                    }}
                    className={`${inputClass} flex items-center justify-between disabled:cursor-not-allowed disabled:opacity-60 ${originCode ? "text-[#e7ecf3]" : "text-[#6b7b94]"}`}
                  >
                    <span>{originLabel()}</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#6b7b94"
                      strokeWidth="2"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {cityOpen === "origin" && (
                    <CityDropdown
                      query={cityQuery}
                      onQuery={setCityQuery}
                      cities={filteredCities}
                      onPick={(code) => {
                        setOriginCode(code);
                        setCityOpen(null);
                      }}
                      onClose={() => setCityOpen(null)}
                    />
                  )}
                </div>
                <div className="relative">
                  <span className={labelClass}>مقصد *</span>
                  <button
                    type="button"
                    disabled={inheritedOccurrenceLocked}
                    onClick={() => {
                      setCityOpen(cityOpen === "dest" ? null : "dest");
                      setCityQuery("");
                    }}
                    className={`${inputClass} flex items-center justify-between disabled:cursor-not-allowed disabled:opacity-60 ${destCode ? "text-[#e7ecf3]" : "text-[#6b7b94]"}`}
                  >
                    <span>{destLabel()}</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#6b7b94"
                      strokeWidth="2"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {cityOpen === "dest" && (
                    <CityDropdown
                      query={cityQuery}
                      onQuery={setCityQuery}
                      cities={filteredCities}
                      onPick={(code) => {
                        setDestCode(code);
                        setCityOpen(null);
                      }}
                      onClose={() => setCityOpen(null)}
                    />
                  )}
                </div>
                <div>
                  <span className={labelClass}>تاریخ پرواز *</span>
                  <div className="h-11 rounded-[10px] border border-[#28344c] bg-[#0f1726]">
                    <JalaliDatePicker
                      label="تاریخ پرواز"
                      value={dateIso}
                      onChange={setDateIso}
                      theme="dark"
                      singleLine
                      minDate={dateMin}
                      testId="af-date"
                      placeholder="انتخاب تاریخ"
                      disabled={inheritedOccurrenceLocked}
                    />
                  </div>
                </div>
                <TimePicker
                  id="af-time"
                  label="ساعت پرواز *"
                  value={time}
                  onChange={setTime}
                  testId="af-time"
                  placeholder="HH:mm"
                  disabled={inheritedOccurrenceLocked}
                />
                <DurationFields
                  hours={durationHours}
                  minutes={durationMins}
                  onHours={setDurationHours}
                  onMinutes={setDurationMins}
                  showError={showValidation}
                  disabled={inheritedOccurrenceLocked}
                />
                <div>
                  <label className={labelClass} htmlFor="af-arrival">
                    زمان رسیدن
                  </label>
                  <input
                    id="af-arrival"
                    data-testid="af-arrival"
                    dir="ltr"
                    readOnly
                    value={arrival ? faDigits(arrival) : ""}
                    placeholder="—"
                    className={`${inputClass} text-left font-num opacity-80`}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="af-aircraft">
                    نوع هواپیما
                  </label>
                  <select
                    id="af-aircraft"
                    data-testid="af-aircraft"
                    value={aircraft}
                    disabled={inheritedOccurrenceLocked}
                    onChange={(e) =>
                      void applyAircraftDefinition(e.target.value)
                    }
                    className={`${inputClass} cursor-pointer font-num disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {(aircraftTypes.length
                      ? aircraftTypes.map((a) => a.aircraftType)
                      : ["Airbus A320"]
                    ).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                {isEdit && (
                  <div>
                    <label className={labelClass} htmlFor="af-charter">
                      تعهد چارتری (صندلی)
                    </label>
                    <input
                      id="af-charter"
                      dir="ltr"
                      inputMode="numeric"
                      placeholder="مثلاً ۶۰"
                      value={charter}
                      onChange={(e) =>
                        setCharter(
                          latinDigits(e.target.value)
                            .replace(/\D/g, "")
                            .slice(0, 4),
                        )
                      }
                      className={`${inputClass} text-left font-num`}
                    />
                  </div>
                )}
              </div>
              <div className="mt-4 border-t border-[#28344c] pt-4">
                <CabinCapacityEditor
                  rows={cabinRows}
                  onChange={setCabinRows}
                  error={cabinCapacityError}
                  readOnly={inheritedOccurrenceLocked}
                  availableCabins={aircraftCabinLimits.length > 0 ? aircraftCabinLimits : undefined}
                />
              </div>
              {resolvedTemplate && !isEdit && (
                <div
                  className="mt-3 rounded-xl border border-blue-400/25 bg-blue-400/10 p-3 text-blue-100"
                  data-testid="resolved-schedule-summary"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-xs">
                      مسیر زمان‌بندی‌شده پیدا شد و اطلاعات خودکار تکمیل شد
                    </strong>
                    <span className="rounded-full bg-blue-300/15 px-2.5 py-1 text-[10px] text-blue-200">
                      همه روزهای این شماره در یک درخواست
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 rounded-lg border border-blue-300/15 bg-[#0f1726]/60 p-2 text-[10.5px] sm:grid-cols-2">
                    <span>
                      روزهای انجام پرواز: {" "}
                      <b className="text-white">
                        {resolvedTemplate.weekdays
                          .map((weekday) => ISO_WEEKDAY_LABELS[weekday])
                          .filter(Boolean)
                          .join("، ") || "—"}
                      </b>
                    </span>
                    <span>
                      ماه‌های انجام پرواز: {" "}
                      <b className="text-white">
                        {Array.from(
                          new Set(
                            resolvedTemplate.occurrences.map((occurrence) =>
                              localeMonthYear(
                                dayjs(occurrence.departureAt).calendar("jalali"),
                                "fa",
                              ),
                            ),
                          ),
                        )
                          .map(faDigits)
                          .join("، ") || "—"}
                      </b>
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="mb-2 text-[10.5px] font-bold text-blue-100">
                      یک روز را به‌عنوان نمونه انتخاب کنید؛ تصمیم برای همه روزهای زیر اعمال می‌شود
                    </div>
                    <div
                      className="flex max-h-36 flex-wrap gap-2 overflow-y-auto pl-1"
                      data-testid="schedule-occurrence-list"
                    >
                      {resolvedTemplate.occurrences.map((occurrence) => {
                        const departure = dayjs(occurrence.departureAt).calendar(
                          "jalali",
                        );
                        const selected = occurrence.id === selectedOccurrenceId;
                        const enabled = COMPLETABLE_OCCURRENCE_STATUSES.has(
                          occurrence.definitionStatus,
                        );
                        return (
                          <button
                            type="button"
                            key={occurrence.id}
                            disabled={!enabled || routeResolving}
                            onClick={() => void chooseOccurrence(occurrence.id)}
                            data-testid={`schedule-occurrence-${occurrence.id}`}
                            aria-pressed={selected}
                            className={`rounded-lg border px-3 py-2 text-right transition disabled:cursor-not-allowed disabled:opacity-45 ${
                              selected
                                ? "border-blue-300 bg-blue-500 text-white shadow-sm"
                                : "border-blue-300/20 bg-[#0f1726] text-blue-100 hover:border-blue-300/50"
                            }`}
                          >
                            <span className="block text-[10px] font-bold">
                              {localeWeekdayLong(departure, "fa")}
                            </span>
                            <span className="mt-0.5 block font-num text-[11px]">
                              {faDigits(departure.format("YYYY/MM/DD · HH:mm"))}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10.5px] text-blue-200 sm:grid-cols-4">
                    <span>
                      شماره: <b className="font-num text-white">{flightNo}</b>
                    </span>
                    <span>
                      هواپیما: <b className="font-num text-white">{aircraft}</b>
                    </span>
                    <span>
                      ظرفیت:{" "}
                      <b className="font-num text-white">
                        {faDigits(capacity)} صندلی
                      </b>
                    </span>
                    <span>
                      تاریخ و ساعت:{" "}
                      <b className="font-num text-white">
                        {selectedOccurrence
                          ? faDigits(
                              dayjs(selectedOccurrence.departureAt)
                                .calendar("jalali")
                                .format("YYYY/MM/DD"),
                            )
                          : "—"}{" "}
                        · {faDigits(time || "—")}
                      </b>
                    </span>
                  </div>
                </div>
              )}
            </section>

            <details
              className={`${!isEdit && wizardStep !== 0 ? "hidden" : ""} mb-[15px] rounded-2xl border border-[#1f2a3d] bg-[#141d2e] px-[19px] py-[16px]`}
            >
              <summary className="cursor-pointer text-[13px] font-extrabold text-[#c7d4e8]">
                قوانین هزینه و جریمه (تنظیمات تکمیلی)
              </summary>
              <div className="mt-4">
                <ChargeRulesEditor
                  rules={chargeRules}
                  onChange={setChargeRules}
                  basePriceIrr={basePriceIrr}
                />
              </div>
            </details>

            {/* کلاس‌های نرخی */}
            <section
              className={`${!isEdit && wizardStep !== 1 ? "hidden" : ""} mb-[15px] rounded-2xl border border-[#1f2a3d] bg-[#141d2e] px-[19px] py-[18px]`}
            >
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#60a5fa]" />
                  <h2 className="m-0 text-[14.5px] font-extrabold text-white">
                    کلاس‌های نرخی پرواز
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={openFareCreate}
                  className="flex items-center gap-1.5 rounded-[9px] bg-[#3b82f6] px-[13px] py-2 text-[11.5px] font-bold text-white"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  افزودن کلاس نرخی
                </button>
              </div>
              <p className="mb-[13px] text-[11px] text-[#6b7b94]">
                کلاس‌های Y/B/M و... این پرواز را پیش از ثبت نهایی تعریف کنید؛
                ظرفیت هر کلاس در برابر جمع صندلی کابین‌ها اعتبارسنجی می‌شود.
              </p>

              {fareFormOpen && (
                <div className="mb-3 rounded-xl border border-[#2a3550] bg-[#0f1623] p-3">
                  <div className="mb-2.5 text-[11.5px] font-extrabold text-[#e7ecf3]">
                    {fareEditingId ? "ویرایش کلاس نرخی" : "کلاس نرخی جدید"}
                  </div>
                  <div
                    className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
                    data-testid="fare-cabin-capacity-summary"
                  >
                    {cabinRows
                      .filter((row) => (Number(latinDigits(row.seats)) || 0) > 0)
                      .map((row) => {
                        const total = Number(latinDigits(row.seats)) || 0;
                        const assigned = fares
                          .filter(
                            (fare) =>
                              fare.cabin === row.cabin &&
                              fare.tempId !== fareEditingId,
                          )
                          .reduce((sum, fare) => sum + fare.seatsAllocated, 0);
                        return (
                          <div
                            key={row.key}
                            className={`rounded-lg border px-3 py-2 ${
                              row.cabin === fareForm.cabin
                                ? "border-blue-400 bg-blue-500/10"
                                : "border-[#28344c] bg-[#141d2e]"
                            }`}
                          >
                            <strong className="block text-[10.5px] text-white">
                              {cabinLabel(row.cabin)}
                            </strong>
                            <span className="mt-1 block font-num text-[10px] text-[#9fb0c7]">
                              کل {faDigits(total)} · تخصیص‌یافته {faDigits(assigned)} · آزاد {faDigits(Math.max(total - assigned, 0))}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                  {fareError && (
                    <div className="mb-2.5 rounded-[9px] border border-[rgba(248,113,113,.3)] bg-[rgba(248,113,113,.1)] px-2.5 py-2 text-[11px] font-semibold text-[#f87171]">
                      {fareError}
                    </div>
                  )}
                  <div className="mb-[9px] grid grid-cols-1 gap-[9px] sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-[10.5px] text-[#9fb0c7]">
                        نام کابین
                      </label>
                      <select
                        value={fareForm.cabin}
                        onChange={(e) =>
                          setFareForm((f) => ({
                            ...f,
                            cabin: e.target.value as CabinKind,
                          }))
                        }
                        className="h-10 w-full rounded-[9px] border border-[#28344c] bg-[#141d2e] px-[9px] text-[11.5px] text-[#e7ecf3]"
                      >
                        {availableFareCabins.map((cabin) => (
                          <option key={cabin} value={cabin}>
                            {cabinLabel(cabin)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10.5px] text-[#9fb0c7]">
                        کد کلاس (مثلاً Y)
                      </label>
                      <input
                        dir="ltr"
                        value={fareForm.classCode}
                        onChange={(e) =>
                          setFareForm((f) => ({
                            ...f,
                            classCode: e.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-[9px] border border-[#28344c] bg-[#141d2e] px-[9px] font-num text-left text-[11.5px] text-[#e7ecf3]"
                      />
                    </div>
                    <MoneyInput
                      label="قیمت پایه (تومان)"
                      valueToman={fareForm.priceToman}
                      onChangeToman={(v) =>
                        setFareForm((f) => ({ ...f, priceToman: v }))
                      }
                      testId="fare-price-money"
                    />
                    <div>
                      <label className="mb-1.5 block text-[10.5px] text-[#9fb0c7]">
                        روش مالیات و عوارض
                      </label>
                      <select
                        value={fareForm.taxMode}
                        onChange={(e) =>
                          setFareForm((f) => ({
                            ...f,
                            taxMode: e.target.value as "FIXED" | "PERCENTAGE",
                          }))
                        }
                        className="mb-1.5 h-10 w-full rounded-[9px] border border-[#28344c] bg-[#141d2e] px-[9px] text-[11.5px] text-[#e7ecf3]"
                        data-testid="fare-tax-mode"
                      >
                        <option value="FIXED">مبلغ ثابت</option>
                        <option value="PERCENTAGE">درصد از قیمت</option>
                      </select>
                      {fareForm.taxMode === "PERCENTAGE" ? (
                        <div className="relative">
                          <input
                            dir="ltr"
                            inputMode="decimal"
                            value={fareForm.taxPercent}
                            onChange={(e) =>
                              setFareForm((f) => ({
                                ...f,
                                taxPercent: e.target.value,
                              }))
                            }
                            placeholder="مثلاً ۹٪"
                            className="h-10 w-full rounded-[9px] border border-[#28344c] bg-[#0f1726] px-3 pr-9 text-left font-num text-[11.5px] text-[#e7ecf3] outline-none"
                            data-testid="fare-tax-percent"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] text-[#9fb0c7]">
                            ٪
                          </span>
                        </div>
                      ) : (
                        <MoneyInput
                          label="مالیات و عوارض (تومان)"
                          valueToman={fareForm.taxToman}
                          onChangeToman={(v) => setFareForm((f) => ({ ...f, taxToman: v }))}
                          testId="fare-tax-money"
                        />
                      )}
                    </div>
                    <div data-testid="fare-infant-auto">
                      <label className="mb-1.5 block text-[10.5px] text-[#9fb0c7]">
                        نرخ نوزاد (خودکار، ۱۰٪)
                      </label>
                      <div className="flex h-10 items-center justify-between rounded-[9px] border border-[#28344c] bg-[#0f1726] px-3 font-num text-[11.5px] text-[#e7ecf3]">
                        <span>تومان</span>
                        <span>{infantFareToman || "۰"}</span>
                      </div>
                    </div>
                    <div data-testid="fare-child-auto">
                      <label className="mb-1.5 block text-[10.5px] text-[#9fb0c7]">
                        نرخ کودک (خودکار، {fareIsCharterOnly ? "۱۰۰٪" : "۵۰٪"})
                      </label>
                      <div className="flex h-10 items-center justify-between rounded-[9px] border border-[#28344c] bg-[#0f1726] px-3 font-num text-[11.5px] text-[#e7ecf3]">
                        <span>تومان</span>
                        <span>{childFareToman || "۰"}</span>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10.5px] text-[#9fb0c7]">
                        ظرفیت اختصاصی (صندلی)
                      </label>
                      <input
                        dir="ltr"
                        value={fareForm.seatsAllocated}
                        onChange={(e) =>
                          setFareForm((f) => ({
                            ...f,
                            seatsAllocated: e.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-[9px] border border-[#28344c] bg-[#141d2e] px-[9px] font-num text-left text-[11.5px] text-[#e7ecf3]"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10.5px] text-[#9fb0c7]">
                        سهمیه بار مجاز (کیلوگرم)
                      </label>
                      <input
                        dir="ltr"
                        value={fareForm.baggageKg}
                        onChange={(e) =>
                          setFareForm((f) => ({
                            ...f,
                            baggageKg: e.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-[9px] border border-[#28344c] bg-[#141d2e] px-[9px] font-num text-left text-[11.5px] text-[#e7ecf3]"
                      />
                    </div>
                    <div className="h-10 rounded-[9px] border border-[#28344c] bg-[#141d2e]">
                      <JalaliDatePicker
                        label="شروع اعتبار"
                        value={fareForm.validFrom}
                        onChange={(iso) =>
                          setFareForm((f) => ({ ...f, validFrom: iso }))
                        }
                        theme="dark"
                        singleLine
                        testId="fare-valid-from"
                        placeholder="شروع اعتبار"
                      />
                    </div>
                    <div className="h-10 rounded-[9px] border border-[#28344c] bg-[#141d2e]">
                      <JalaliDatePicker
                        label="پایان اعتبار"
                        value={fareForm.validUntil}
                        onChange={(iso) =>
                          setFareForm((f) => ({ ...f, validUntil: iso }))
                        }
                        theme="dark"
                        singleLine
                        minDate={fareForm.validFrom ?? undefined}
                        testId="fare-valid-until"
                        placeholder="پایان اعتبار"
                      />
                    </div>
                  </div>
                  <div className="mb-2.5 flex items-center gap-4">
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[#e7ecf3]">
                      <input
                        type="checkbox"
                        checked={fareForm.refundable}
                        onChange={(e) =>
                          setFareForm((f) => ({
                            ...f,
                            refundable: e.target.checked,
                          }))
                        }
                      />
                      استرداد‌پذیر
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[#e7ecf3]">
                      <input
                        type="checkbox"
                        checked={fareForm.changeable}
                        onChange={(e) =>
                          setFareForm((f) => ({
                            ...f,
                            changeable: e.target.checked,
                          }))
                        }
                      />
                      قابل تغییر تاریخ
                    </label>
                  </div>
                  <div className="mb-3">
                    <div className="mb-[7px] text-[10.5px] text-[#9fb0c7]">
                      کانال‌های مجاز فروش
                    </div>
                    <div className="flex flex-wrap gap-[7px]">
                      {CHANNEL_OPTS.map((ch) => {
                        const on = fareForm.allowedChannels.includes(ch.key);
                        return (
                          <button
                            key={ch.key}
                            type="button"
                            onClick={() =>
                              setFareForm((f) => ({
                                ...f,
                                allowedChannels: on
                                  ? f.allowedChannels.filter(
                                      (c) => c !== ch.key,
                                    )
                                  : [...f.allowedChannels, ch.key],
                              }))
                            }
                            className={`rounded-lg border px-[11px] py-1.5 text-[10.5px] font-bold ${
                              on
                                ? "border-[#3b82f6] bg-[rgba(59,130,246,.16)] text-[#60a5fa]"
                                : "border-[#28344c] bg-transparent text-[#9fb0c7]"
                            }`}
                          >
                            {ch.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveFareDraft}
                      className="flex h-10 flex-1 items-center justify-center rounded-[9px] bg-[#3b82f6] text-[11.5px] font-extrabold text-white"
                    >
                      ثبت کلاس نرخی
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFareFormOpen(false);
                        setFareEditingId(null);
                      }}
                      className="flex h-10 items-center justify-center rounded-[9px] border border-[#28344c] px-4 text-[11.5px] font-semibold text-[#9fb0c7]"
                    >
                      انصراف
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-[9px]">
                {fares.map((c) => (
                  <div
                    key={c.tempId}
                    className="rounded-xl border border-[#28344c] bg-[#18223a] p-[11px]"
                  >
                    <div className="mb-[9px] flex items-center justify-between">
                      <div className="flex items-center gap-[7px]">
                        <span
                          dir="ltr"
                          className="rounded-[7px] bg-[rgba(59,130,246,.14)] px-[9px] py-[3px] font-num text-[11px] font-black text-[#60a5fa]"
                        >
                          {c.classCode}
                        </span>
                        <span className="text-[11.5px] font-bold text-[#e7ecf3]">
                          {c.cabinLabel}
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => openFareEdit(c)}
                          className="rounded-lg bg-[rgba(59,130,246,.1)] px-2.5 py-1.5 text-[10.5px] font-bold text-[#60a5fa]"
                        >
                          ویرایش
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setFares((list) =>
                              list.filter((x) => x.tempId !== c.tempId),
                            )
                          }
                          className="rounded-lg bg-[rgba(248,113,113,.1)] px-2.5 py-1.5 text-[10.5px] font-bold text-[#f87171]"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                      <div>
                        <span className="text-[#6b7b94]">قیمت پایه</span>
                        <div className="mt-0.5 font-bold text-[#e7ecf3]">
                          {faMoney(c.priceIrr)} تومان
                        </div>
                      </div>
                      <div>
                        <span className="text-[#6b7b94]">مالیات و عوارض</span>
                        <div className="mt-0.5 font-bold text-[#e7ecf3]">
                          {faMoney(c.taxIrr)} تومان
                        </div>
                      </div>
                      <div>
                        <span className="text-[#6b7b94]">ظرفیت اختصاصی</span>
                        <div className="mt-0.5 font-bold text-[#e7ecf3]">
                          {faDigits(c.seatsAllocated)} صندلی
                        </div>
                      </div>
                      <div>
                        <span className="text-[#6b7b94]">سهمیه بار مجاز</span>
                        <div className="mt-0.5 font-bold text-[#e7ecf3]">
                          {c.baggageAllowanceKg
                            ? `${faDigits(c.baggageAllowanceKg)} کیلوگرم`
                            : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-[14px] px-[9px] py-1 text-[10px] font-bold ${
                          c.refundable
                            ? "bg-[rgba(52,211,153,.14)] text-[#34d399]"
                            : "bg-[rgba(248,113,113,.14)] text-[#f87171]"
                        }`}
                      >
                        {c.refundable ? "استرداد‌پذیر" : "غیرقابل استرداد"}
                      </span>
                      <span
                        className={`rounded-[14px] px-[9px] py-1 text-[10px] font-bold ${
                          c.changeable
                            ? "bg-[rgba(52,211,153,.14)] text-[#34d399]"
                            : "bg-[rgba(248,113,113,.14)] text-[#f87171]"
                        }`}
                      >
                        {c.changeable ? "قابل تغییر" : "غیرقابل تغییر"}
                      </span>
                      {c.allowedChannels.map((ch) => (
                        <span
                          key={ch}
                          className="rounded-[14px] bg-[#0f1623] px-[9px] py-1 text-[10px] font-semibold text-[#9fb0c7]"
                        >
                          {CHANNEL_OPTS.find((o) => o.key === ch)?.label ?? ch}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {fares.length === 0 && (
                  <div className="px-4 py-4 text-center text-[11px] text-[#6b7b94]">
                    هنوز کلاس نرخی برای این پرواز تعریف نشده است.
                  </div>
                )}
              </div>
            </section>

            {/* قیمت‌گذاری */}
            <section
              className={`${!isEdit && wizardStep !== 2 ? "hidden" : ""} mb-[15px] rounded-2xl border border-[#1f2a3d] bg-[#141d2e] px-[19px] py-[18px]`}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#a78bfa]" />
                  <h2 className="m-0 text-[14.5px] font-extrabold text-white">
                    قیمت‌گذاری
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={runAi}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-60"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4z" />
                  </svg>
                  {aiLoading ? "در حال تحلیل…" : "پیشنهاد قیمت هوش مصنوعی"}
                </button>
              </div>
              <div className="mb-[13px] grid grid-cols-1 gap-[13px] sm:grid-cols-2">
                <MoneyInput
                  id="af-base"
                  label="قیمت پایهٔ شرکت (تومان)"
                  valueToman={baseToman}
                  onChangeToman={setBaseToman}
                  testId="af-base-money"
                />
                <MoneyInput
                  id="af-comp"
                  label="قیمت رقبا (تومان)"
                  valueToman={compToman}
                  onChangeToman={setCompToman}
                  testId="af-comp-money"
                />
              </div>

              {ai && (
                <div className="mb-3.5 rounded-[13px] border border-[rgba(124,58,237,.32)] bg-[rgba(124,58,237,.08)] p-3.5">
                  <div className="mb-[9px] flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
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
                      <span className="text-[12.5px] font-extrabold text-[#c4b5fd]">
                        پیشنهاد هوش مصنوعی
                      </span>
                    </div>
                    <div className="text-left">
                      <span className="text-[9.5px] text-[#8b7fb8]">
                        قیمت پیشنهادی
                      </span>
                      <div className="text-[15px] font-black text-white">
                        {faDigits(ai.priceToman.toLocaleString("en-US"))}
                      </div>
                    </div>
                  </div>
                  <p className="mb-[9px] text-xs leading-[2] text-[#dbe3f0]">
                    {ai.reason}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {ai.factors.map((f) => (
                      <div
                        key={f}
                        className="flex items-start gap-2 text-[11.5px] leading-[1.8] text-[#aebbd0]"
                      >
                        <span className="mt-[7px] h-[5px] w-[5px] flex-none rounded-full bg-[#a78bfa]" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-[13px] sm:grid-cols-2">
                <MoneyInput
                  id="af-proposed"
                  label="نرخ پیشنهادی نهایی (تومان) *"
                  valueToman={proposedToman}
                  onChangeToman={setProposedToman}
                  testId="af-proposed-money"
                />
                <MoneyInput
                  id="af-legal"
                  label="نرخ قانونی / مصوب (تومان)"
                  valueToman={legalToman}
                  onChangeToman={setLegalToman}
                  testId="af-legal-money"
                />
              </div>
              <div className="mt-[13px] grid grid-cols-1 gap-3">
                <div>
                  <label className={labelClass} htmlFor="af-ceo-note">
                    یادداشت برای مدیرعامل (اختیاری)
                  </label>
                  <textarea
                    id="af-ceo-note"
                    placeholder="توضیح دلیل قیمت پیشنهادی برای مدیرعامل…"
                    value={ceoNote}
                    onChange={(e) => setCeoNote(e.target.value)}
                    className="min-h-[66px] w-full resize-y rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 py-2.5 text-[12.5px] leading-[1.8] text-[#e7ecf3] outline-none"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="af-operations-note">
                    یادداشت برای مدیر عملیات (اختیاری)
                  </label>
                  <textarea
                    id="af-operations-note"
                    placeholder="نکات عملیاتی این پرواز…"
                    value={operationsNote}
                    onChange={(e) => setOperationsNote(e.target.value)}
                    className="min-h-[66px] w-full resize-y rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 py-2.5 text-[12.5px] leading-[1.8] text-[#e7ecf3] outline-none"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="af-commercial-note">
                    یادداشت مدیر بازرگانی (اختیاری)
                  </label>
                  <textarea
                    id="af-commercial-note"
                    placeholder="توضیح داخلی برای پیگیری تیم بازرگانی…"
                    value={commercialNote}
                    onChange={(e) => setCommercialNote(e.target.value)}
                    className="min-h-[66px] w-full resize-y rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 py-2.5 text-[12.5px] leading-[1.8] text-[#e7ecf3] outline-none"
                  />
                </div>
              </div>
            </section>

            {error && (
              <p role="alert" className="mb-3 text-xs text-[#f87171]">
                {error}
              </p>
            )}

            <div className="flex gap-[11px]">
              {!isEdit && wizardStep > 0 && (
                <button
                  type="button"
                  onClick={() => setWizardStep((step) => Math.max(0, step - 1))}
                  className="flex h-12 items-center justify-center rounded-xl border border-[#28344c] bg-[#18223a] px-5 text-[13px] font-bold text-[#c7d4e8]"
                >
                  مرحله قبل
                </button>
              )}
              {!isEdit && wizardStep < 2 ? (
                <button
                  type="button"
                  onClick={goToNextStep}
                  className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#3b82f6] text-[13.5px] font-extrabold text-white"
                >
                  ادامه به مرحله بعد
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onSubmit()}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#3b82f6] text-[13.5px] font-extrabold text-white disabled:opacity-60"
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
                  </svg>
                  {submitLabel}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex h-12 items-center justify-center rounded-xl border border-[#28344c] bg-[#18223a] px-[22px] text-[13px] font-bold text-[#9fb0c7]"
              >
                انصراف
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CityDropdown({
  query,
  onQuery,
  cities,
  onPick,
  onClose,
}: {
  query: string;
  onQuery: (q: string) => void;
  cities: AirportEntry[];
  onPick: (code: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-[38]" onClick={onClose} aria-hidden />
      <div className="absolute start-0 end-0 top-[74px] z-[39] max-h-[260px] overflow-y-auto rounded-xl border border-[#28344c] bg-[#141d2e] shadow-[0_18px_44px_-12px_rgba(0,0,0,.5)]">
        <div className="sticky top-0 bg-[#141d2e] p-2">
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="جستجوی شهر یا کد فرودگاه..."
            className="h-9 w-full rounded-lg border border-[#28344c] bg-[#0f1623] px-2.5 text-[12.5px] text-[#e7ecf3] outline-none"
            autoFocus
          />
        </div>
        {cities.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => onPick(c.code)}
            className="flex w-full items-center justify-between px-3 py-[9px] text-[12.5px] text-[#e7ecf3] hover:bg-[#1c2740]"
          >
            <span className="min-w-0 text-start">
              <span className="block font-bold">{c.cityFa}</span>
              <span className="mt-0.5 block truncate text-[10.5px] text-[#6b7b94]">
                {c.airportNameFa || `فرودگاه ${c.cityFa}`}
              </span>
            </span>
            <span
              dir="ltr"
              className="font-num rounded-md bg-[#22304a] px-2 py-1 text-[11px] font-bold text-[#8fb8ff]"
            >
              {c.code}
            </span>
          </button>
        ))}
        {cities.length === 0 && (
          <div className="px-3 py-3.5 text-center text-[11.5px] text-[#6b7b94]">
            شهری یافت نشد.
          </div>
        )}
      </div>
    </>
  );
}
