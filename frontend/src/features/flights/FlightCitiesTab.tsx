import { useMemo, useState } from "react";
import { createAirport, deleteAirport } from "../../api/flights";
import PanelAlert from "../panel/PanelAlert";
import PanelModal from "../panel/PanelModal";
import {
  AIRPORT_REFERENCE_CATALOG,
  AIRPORT_REFERENCE_COUNTRIES,
} from "../../lib/airport-reference-catalog";
import { faDigits } from "../../lib/fa-format";
import type { AirportEntry } from "../../types/flights";

interface FlightCitiesTabProps {
  airports: AirportEntry[];
  onCreated: (airport: AirportEntry) => void;
  onDeleted: (id: string) => void;
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function FlightCitiesTab({
  airports,
  onCreated,
  onDeleted,
}: FlightCitiesTabProps) {
  const [entryMode, setEntryMode] = useState<"catalog" | "manual">("catalog");
  const [selectedCode, setSelectedCode] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualAirportName, setManualAirportName] = useState("");
  const [manualScope, setManualScope] = useState<"iran" | "foreign">("iran");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AirportEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const activeCodes = useMemo(
    () => new Set(airports.map((airport) => airport.code)),
    [airports],
  );
  const selectedAirport = useMemo(
    () => AIRPORT_REFERENCE_CATALOG.find((item) => item.code === selectedCode),
    [selectedCode],
  );

  async function onSubmit() {
    setError(null);
    setNotice(null);
    const manual = entryMode === "manual";
    const cityFa = manual ? manualCity.trim() : selectedAirport?.cityFa;
    const code = manual
      ? manualCode.trim().toUpperCase()
      : selectedAirport?.code;
    const airportNameFa = manual
      ? manualAirportName.trim() || undefined
      : selectedAirport?.airportNameFa;
    const tz = manual ? "Asia/Tehran" : selectedAirport?.tz;
    const isInternational = manual
      ? manualScope === "foreign"
      : selectedAirport?.countryFa !== "ایران";
    if (!cityFa) {
      setError(
        manual
          ? "نام شهر را وارد کنید."
          : "یک شهر و فرودگاه را از فهرست انتخاب کنید.",
      );
      return;
    }
    if (!code || !/^[A-Z]{3}$/.test(code)) {
      setError("کد فرودگاه باید دقیقاً سه حرف انگلیسی باشد.");
      return;
    }
    setBusy(true);
    try {
      const created = await createAirport({
        cityFa,
        code,
        airportNameFa,
        tz,
        isInternational,
      });
      setSelectedCode("");
      setManualCity("");
      setManualCode("");
      setManualAirportName("");
      setManualScope("iran");
      onCreated(created);
      setNotice(
        `«${airportNameFa || `فرودگاه ${cityFa}`}» اضافه شد و از اکنون در انتخابگرهای پرواز و جستجوی سایت نمایش داده می‌شود.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در ثبت فرودگاه.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setError(null);
    setNotice(null);
    setDeleting(true);
    try {
      await deleteAirport(pendingDelete.id);
      onDeleted(pendingDelete.id);
      setNotice(
        `«${pendingDelete.airportNameFa || `فرودگاه ${pendingDelete.cityFa}`}» از شهرهای قابل انتخاب حذف شد. سوابق پروازهای قبلی محفوظ است.`,
      );
      setPendingDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در حذف فرودگاه.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <PanelAlert>{error}</PanelAlert>}
      {notice && <PanelAlert tone="success">{notice}</PanelAlert>}

      <section className="rounded-[14px] border border-panel-border bg-panel-card p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-panel-accent" />
            <h2 className="text-sm font-bold text-white">افزودن شهر جدید</h2>
          </div>
          <div className="flex rounded-lg border border-panel-border-2 bg-panel-elevated p-1">
            <button
              type="button"
              onClick={() => setEntryMode("catalog")}
              className={`rounded-md px-3 py-2 text-[11px] font-bold transition ${entryMode === "catalog" ? "bg-panel-accent text-white" : "text-panel-muted"}`}
            >
              فهرست فرودگاه‌ها
            </button>
            <button
              type="button"
              onClick={() => setEntryMode("manual")}
              className={`rounded-md px-3 py-2 text-[11px] font-bold transition ${entryMode === "manual" ? "bg-panel-accent text-white" : "text-panel-muted"}`}
            >
              ورود دستی
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_.55fr_1.1fr_.7fr_auto] xl:items-end">
          {entryMode === "catalog" ? (
            <label className="block">
              <span className="mb-2 block text-[11px] font-bold text-panel-muted">
                نام شهر و فرودگاه *
              </span>
              <select
                aria-label="نام شهر و فرودگاه"
                value={selectedCode}
                onChange={(event) => setSelectedCode(event.target.value)}
                className="h-11 w-full rounded-lg border border-panel-border-2 bg-panel-elevated px-3 text-xs text-panel-text outline-none focus:border-panel-accent"
              >
                <option value="">انتخاب از فهرست فرودگاه‌ها</option>
                {AIRPORT_REFERENCE_COUNTRIES.map((country) => {
                  const rows = AIRPORT_REFERENCE_CATALOG.filter(
                    (item) =>
                      item.countryFa === country && !activeCodes.has(item.code),
                  );
                  if (rows.length === 0) return null;
                  return (
                    <optgroup key={country} label={country}>
                      {rows.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.cityFa} — {item.airportNameFa} ({item.code})
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className="mb-2 block text-[11px] font-bold text-panel-muted">
                نام شهر *
              </span>
              <input
                aria-label="نام شهر"
                value={manualCity}
                onChange={(event) => setManualCity(event.target.value)}
                placeholder="مثلاً گرگان"
                className="h-11 w-full rounded-lg border border-panel-border-2 bg-panel-elevated px-3 text-xs text-panel-text outline-none focus:border-panel-accent"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-2 block text-[11px] font-bold text-panel-muted">
              کد فرودگاه
            </span>
            <input
              aria-label="کد فرودگاه"
              readOnly={entryMode === "catalog"}
              dir="ltr"
              maxLength={3}
              value={
                entryMode === "catalog"
                  ? (selectedAirport?.code ?? "")
                  : manualCode
              }
              onChange={(event) =>
                setManualCode(
                  event.target.value
                    .replace(/[^A-Za-z]/g, "")
                    .slice(0, 3)
                    .toUpperCase(),
                )
              }
              placeholder="IATA"
              className="font-num h-11 w-full rounded-lg border border-panel-border-2 bg-panel-elevated px-3 text-xs font-bold text-panel-link outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] font-bold text-panel-muted">
              موقعیت فرودگاه
            </span>
            <select
              aria-label="موقعیت فرودگاه"
              disabled={entryMode === "catalog"}
              value={
                entryMode === "catalog"
                  ? selectedAirport
                    ? selectedAirport.countryFa === "ایران"
                      ? "iran"
                      : "foreign"
                    : ""
                  : manualScope
              }
              onChange={(event) =>
                setManualScope(event.target.value as "iran" | "foreign")
              }
              className="h-11 w-full rounded-lg border border-panel-border-2 bg-panel-elevated px-3 text-xs text-panel-text outline-none focus:border-panel-accent disabled:opacity-70"
            >
              <option value="" disabled>پس از انتخاب فرودگاه</option>
              <option value="iran">داخل ایران</option>
              <option value="foreign">خارج از ایران</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] font-bold text-panel-muted">
              نام فرودگاه
            </span>
            <input
              aria-label="نام فرودگاه"
              readOnly={entryMode === "catalog"}
              value={
                entryMode === "catalog"
                  ? (selectedAirport?.airportNameFa ?? "")
                  : manualAirportName
              }
              onChange={(event) => setManualAirportName(event.target.value)}
              placeholder={
                entryMode === "catalog"
                  ? "پس از انتخاب شهر تکمیل می‌شود"
                  : "اختیاری"
              }
              className="h-11 w-full rounded-lg border border-panel-border-2 bg-panel-elevated px-3 text-xs text-panel-text outline-none"
            />
          </label>

          <button
            type="button"
            disabled={
              busy ||
              (entryMode === "catalog"
                ? !selectedAirport
                : !manualCity.trim() || !/^[A-Z]{3}$/.test(manualCode))
            }
            onClick={() => void onSubmit()}
            className="h-11 rounded-lg bg-panel-accent px-6 text-xs font-bold text-white transition hover:bg-panel-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "در حال ثبت…" : "افزودن شهر"}
          </button>
        </div>

        <p className="mt-4 text-[11px] leading-6 text-panel-muted">
          می‌توانید از فهرست مرجع انتخاب کنید یا نام شهر و کد سه‌حرفی IATA را
          دستی وارد کنید. فقط شهرهای ثبت‌شده در این صفحه در جستجوی بلیط سایت
          نمایش داده می‌شوند.
        </p>
      </section>

      <section className="overflow-hidden rounded-[14px] border border-panel-border bg-panel-card">
        <div className="flex items-center justify-between border-b border-panel-border px-5 py-4">
          <h2 className="text-sm font-bold text-white">شهرهای دارای پرواز</h2>
          <span className="text-[11px] text-panel-muted">
            {faDigits(airports.length)} شهر / فرودگاه
          </span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[650px]">
            <div className="grid grid-cols-[1fr_.55fr_1.5fr_42px] gap-4 border-b border-panel-border px-5 py-3 text-[10px] font-bold text-panel-muted">
              <span>شهر</span>
              <span>کد</span>
              <span>فرودگاه</span>
              <span className="sr-only">عملیات</span>
            </div>
            {airports.map((airport) => (
              <div
                key={airport.id}
                className="grid grid-cols-[1fr_.55fr_1.5fr_42px] items-center gap-4 border-b border-panel-border px-5 py-4 text-xs last:border-b-0 hover:bg-panel-elevated/45"
              >
                <span className="font-bold text-white">{airport.cityFa}</span>
                <span
                  dir="ltr"
                  className="font-num w-fit rounded-md bg-panel-elevated px-2 py-1 font-bold text-panel-link"
                >
                  {airport.code}
                </span>
                <span className="text-panel-muted-2">
                  {airport.airportNameFa || `فرودگاه ${airport.cityFa}`}
                </span>
                <button
                  type="button"
                  aria-label={`حذف ${airport.cityFa} ${airport.code}`}
                  onClick={() => setPendingDelete(airport)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-danger transition hover:bg-danger/10"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
            {airports.length === 0 && (
              <p className="px-5 py-10 text-center text-xs leading-6 text-panel-muted">
                هنوز شهری برای فروش بلیط فعال نشده است. یک فرودگاه را از فهرست
                مرجع انتخاب و اضافه کنید.
              </p>
            )}
          </div>
        </div>
      </section>

      {pendingDelete && (
        <PanelModal
          title="حذف شهر پروازی"
          onClose={() => !deleting && setPendingDelete(null)}
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-panel-border-2 px-4 py-2 text-xs font-bold text-panel-muted-2"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
                className="rounded-lg bg-danger px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {deleting ? "در حال حذف…" : "تأیید حذف"}
              </button>
            </div>
          }
        >
          <p className="text-xs leading-7 text-panel-text">
            «{pendingDelete.airportNameFa || `فرودگاه ${pendingDelete.cityFa}`}»
            از انتخابگر شهرها حذف شود؟ پروازها و گزارش‌های قبلی محفوظ می‌مانند.
          </p>
        </PanelModal>
      )}
    </div>
  );
}
