import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchPriceCalendar } from "../api/publicSite";
import type { StoredLocale } from "../hooks/useLocale";
import { useMobileVisualViewport } from "../hooks/useMobileVisualViewport";
import { dayjs, isoDateAtNoon, toIsoDateOnly } from "../lib/jalali";
import {
  calendarForLocale,
  calendarOffset,
  formatLocaleDate,
  localeDigits,
  localeMonthName,
  localeMonthYear,
  localeWeekdayLong,
  localeWeekdays,
} from "../lib/locale-format";
import {
  formatPriceCalendarPrice,
  isPriceCalendarEmpty,
  priceCalendarCopy,
} from "../lib/price-calendar";

interface Cell {
  date: number;
  iso: string;
  disabled: boolean;
}

type CalendarViewMode = "day" | "month" | "year";

function buildMonthCells(
  viewMonth: ReturnType<typeof dayjs>,
  minIso: string | null,
  locale: StoredLocale,
): (Cell | null)[] {
  const start = viewMonth.startOf("month");
  const offset = calendarOffset(start, locale);
  const daysInMonth = viewMonth.daysInMonth();
  const cells: (Cell | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    const day = start.add(d - 1, "day");
    const iso = toIsoDateOnly(day);
    cells.push({
      date: d,
      iso,
      disabled: minIso ? iso < minIso.slice(0, 10) : false,
    });
  }
  return cells;
}

interface JalaliDatePickerProps {
  label: string;
  value: string | null;
  onChange: (iso: string) => void;
  minDate?: string;
  testId?: string;
  placeholder?: string;
  subLabel?: string;
  isRTL?: boolean;
  theme?: "light" | "dark";
  /** Compact single-line trigger (toolbar chips in dark panels). */
  compact?: boolean;
  /** Full-height single-line trigger for standard form fields. */
  singleLine?: boolean;
  /** Label rendered externally; flat trigger matching stacked home form fields. */
  embedded?: boolean;
  /** fa uses Jalali; en/ar use Gregorian with locale-specific digits. */
  locale?: StoredLocale;
  /** Mobile flight-search mode: load real fares into the month grid. */
  priceCalendar?: {
    origin: string;
    dest: string;
    locale: StoredLocale;
  };
  disabled?: boolean;
  /** Keep the original month-only header navigation when false. */
  granularNavigation?: boolean;
  rtlForwardArrow?: boolean;
}

function CalendarPortal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}

/** Jalali (شمسی) date picker — CLAUDE.md requires Jalali everywhere users pick dates. */
export default function JalaliDatePicker({
  label,
  value,
  onChange,
  minDate,
  testId,
  placeholder = "انتخاب کنید",
  subLabel,
  isRTL = true,
  theme = "light",
  compact = false,
  singleLine = false,
  embedded = false,
  locale: localeProp,
  priceCalendar,
  disabled = false,
  granularNavigation = true,
  rtlForwardArrow = true,
}: JalaliDatePickerProps) {
  const isPriceCalendar = Boolean(priceCalendar);
  const locale = localeProp ?? priceCalendar?.locale ?? "fa";
  const calendarSystem = calendarForLocale(locale);
  const [open, setOpen] = useState(false);
  const mobileViewport = useMobileVisualViewport(open);
  const visibleViewportWidth =
    mobileViewport?.visibleWidth ??
    (typeof window === "undefined" ? 0 : window.innerWidth);
  const isResponsiveCalendar = visibleViewportWidth < 1024;
  const [draftIso, setDraftIso] = useState<string | null>(
    value ? value.slice(0, 10) : null,
  );
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesError, setPricesError] = useState(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("day");
  const [viewMonth, setViewMonth] = useState(() =>
    value
      ? dayjs(value).calendar(calendarSystem)
      : dayjs().calendar(calendarSystem),
  );
  const [popupPos, setPopupPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const priceCacheRef = useRef(new Map<string, Record<string, string>>());
  const minIso = minDate ?? null;
  const cells = buildMonthCells(viewMonth, minIso, locale);
  const monthKey = `${viewMonth.year()}-${viewMonth.month()}`;
  const yearRangeStart = viewMonth.year() - 5;

  useEffect(() => {
    const source = value ? dayjs(value) : dayjs();
    setViewMonth(source.calendar(calendarSystem));
    setViewMode("day");
  }, [calendarSystem, value]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPopupPos(null);
      return;
    }
    if (isPriceCalendar || isResponsiveCalendar) return;

    function place() {
      if (!rootRef.current || !popupRef.current) return;
      const trigger = rootRef.current.getBoundingClientRect();
      const popup = popupRef.current.getBoundingClientRect();
      const margin = 8;
      const vw = window.innerWidth;
      let left = isRTL ? trigger.right - popup.width : trigger.left;
      left = Math.max(margin, Math.min(left, vw - popup.width - margin));
      setPopupPos({
        top: window.scrollY + trigger.bottom + margin,
        left: window.scrollX + left,
        bottom: undefined,
      });
    }

    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, isRTL, viewMonth, isPriceCalendar, isResponsiveCalendar]);

  useEffect(() => {
    if (!open || !priceCalendar || viewMode !== "day") return;

    const visibleCells = buildMonthCells(
      viewMonth,
      minDate ?? null,
      locale,
    ).filter((cell): cell is Cell => cell !== null);
    const cacheKey = `${priceCalendar.origin}-${priceCalendar.dest}-${monthKey}`;
    const cached = priceCacheRef.current.get(cacheKey);
    if (cached) {
      setPrices(cached);
      setPricesLoading(false);
      setPricesError(false);
      return;
    }

    // The endpoint returns ±3 days. One center per seven-day chunk covers
    // the visible calendar month without inventing any unavailable fare.
    const centers: string[] = [];
    for (let index = 0; index < visibleCells.length; index += 7) {
      const chunk = visibleCells.slice(index, index + 7);
      centers.push(chunk[Math.floor(chunk.length / 2)].iso);
    }

    let cancelled = false;
    setPricesLoading(true);
    setPricesError(false);
    Promise.all(
      centers.map((center) =>
        fetchPriceCalendar(priceCalendar.origin, priceCalendar.dest, center),
      ),
    )
      .then((responses) => {
        if (cancelled) return;
        const visibleDates = new Set(visibleCells.map((cell) => cell.iso));
        const next: Record<string, string> = {};
        responses.flat().forEach((day) => {
          if (visibleDates.has(day.date)) next[day.date] = day.minPriceIrr;
        });
        priceCacheRef.current.set(cacheKey, next);
        setPrices(next);
        setPricesLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPrices({});
        setPricesLoading(false);
        setPricesError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [open, monthKey, minDate, priceCalendar, viewMonth, locale, viewMode]);

  const selectedIsoDay = priceCalendar
    ? draftIso
    : value
      ? value.slice(0, 10)
      : null;

  const displayValue = value ? formatLocaleDate(value, locale) : placeholder;

  const weekdaySub =
    subLabel ??
    (value
      ? localeWeekdayLong(dayjs(value).calendar(calendarSystem), locale) +
        " " +
        localeDigits(
          String(dayjs(value).calendar(calendarSystem).year()),
          locale,
        )
      : label);

  const dark = theme === "dark";
  const valueColor = dark
    ? value
      ? "#f1f5fb"
      : "#a8b5c8"
    : value
      ? "#16233a"
      : "#65758b";
  const inlineTrigger = compact || singleLine || embedded;
  const mutedColor = dark ? "#a8b5c8" : "#65758b";
  const popupBg = dark ? "#141d2e" : "#fff";
  const popupBorder = dark ? "#2a3550" : "#e6eaf0";
  const priceCalendarMargin = 12;
  const viewportWidth = visibleViewportWidth;
  const viewportHeight =
    mobileViewport?.visibleHeight ??
    (typeof window === "undefined" ? 0 : window.innerHeight);
  const pricePopupWidth = Math.min(
    840,
    Math.max(0, viewportWidth - priceCalendarMargin * 2),
  );
  const pricePopupLeft =
    (mobileViewport?.offsetLeft ?? 0) +
    Math.max(priceCalendarMargin, (viewportWidth - pricePopupWidth) / 2);
  const pricePopupTop = (mobileViewport?.offsetTop ?? 0) + priceCalendarMargin;
  const pricePopupMaxHeight = Math.max(
    0,
    viewportHeight - priceCalendarMargin * 2,
  );
  const isModalCalendar = isPriceCalendar || isResponsiveCalendar;
  const responsiveSheetGap = Math.min(
    64,
    Math.max(28, Math.round((viewportHeight || 800) * 0.08)),
  );
  const responsivePopupWidth = viewportWidth;
  const responsivePopupLeft = mobileViewport?.offsetLeft ?? 0;
  const responsiveAvailableHeight = Math.max(
    0,
    viewportHeight - responsiveSheetGap,
  );
  const responsivePopupHeight = Math.min(
    responsiveAvailableHeight,
    isPriceCalendar ? 620 : 470,
  );
  const responsivePopupTop =
    (mobileViewport?.offsetTop ?? 0) + viewportHeight - responsivePopupHeight;
  const dropdownReady = isModalCalendar || popupPos !== null;

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", height: embedded ? "auto" : "100%" }}
    >
      <div
        data-testid={testId}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (disabled) return;
          setDraftIso(value ? value.slice(0, 10) : null);
          if (value) setViewMonth(dayjs(value).calendar(calendarSystem));
          setViewMode("day");
          setOpen((v) => !v);
        }}
        style={{
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          padding: embedded
            ? 0
            : compact
              ? "0 10px"
              : singleLine
                ? "0 15px"
                : "5px 13px",
          display: "flex",
          flexDirection: inlineTrigger ? "row" : "column",
          alignItems: inlineTrigger ? "center" : undefined,
          justifyContent: embedded || singleLine ? "space-between" : "center",
          gap: compact ? 6 : undefined,
          height: embedded
            ? "auto"
            : singleLine
              ? "100%"
              : compact
                ? 38
                : "100%",
          width: embedded ? "100%" : undefined,
          boxSizing: "border-box",
        }}
      >
        {embedded || singleLine ? (
          <>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: valueColor,
                whiteSpace: "nowrap",
              }}
            >
              {value ? displayValue : placeholder}
            </span>
            {!embedded ? (
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke={mutedColor}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
            ) : null}
          </>
        ) : compact ? (
          <>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={mutedColor}
              strokeWidth="1.9"
            >
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M3 9h18M8 2v4M16 2v4" />
            </svg>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: valueColor,
                whiteSpace: "nowrap",
              }}
            >
              {value ? displayValue : placeholder}
            </span>
          </>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: mutedColor,
                fontWeight: 600,
                marginBottom: 3,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M3 9h18M8 2v4M16 2v4" />
              </svg>
              {label}
            </div>
            <div
              style={{ fontSize: "13.5px", fontWeight: 800, color: valueColor }}
            >
              {displayValue}
            </div>
            <div
              style={{ fontSize: "10.5px", color: mutedColor, marginTop: 1 }}
            >
              {weekdaySub}
            </div>
          </>
        )}
      </div>

      {open && (
        <CalendarPortal>
          {isModalCalendar && (
            <div
              data-testid={testId ? `${testId}-overlay` : undefined}
              onClick={() => setOpen(false)}
              style={{
                position: "fixed",
                top: mobileViewport?.offsetTop ?? 0,
                left: mobileViewport?.offsetLeft ?? 0,
                width: viewportWidth,
                height: viewportHeight,
                background: "rgba(8, 18, 36, .48)",
                zIndex: 1199,
              }}
            />
          )}
          <div
            ref={popupRef}
            data-testid={testId ? `${testId}-popup` : undefined}
            role={isModalCalendar ? "dialog" : undefined}
            aria-modal={isModalCalendar ? true : undefined}
            style={{
              position: isModalCalendar ? "fixed" : "absolute",
              top: isResponsiveCalendar
                ? responsivePopupTop
                : priceCalendar
                  ? pricePopupTop
                  : popupPos?.top,
              bottom: isModalCalendar ? undefined : popupPos?.bottom,
              left: isResponsiveCalendar
                ? responsivePopupLeft
                : priceCalendar
                  ? pricePopupLeft
                  : (popupPos?.left ?? 0),
              visibility: dropdownReady ? "visible" : "hidden",
              width: isResponsiveCalendar
                ? responsivePopupWidth
                : priceCalendar
                  ? pricePopupWidth
                  : 300,
              height: isResponsiveCalendar ? responsivePopupHeight : undefined,
              maxWidth: isResponsiveCalendar
                ? "100%"
                : priceCalendar
                  ? 840
                  : "calc(100vw - 24px)",
              maxHeight: isResponsiveCalendar
                ? responsivePopupHeight
                : isPriceCalendar
                  ? pricePopupMaxHeight
                  : undefined,
              overflowY: isModalCalendar ? "auto" : undefined,
              overscrollBehavior: isModalCalendar ? "contain" : undefined,
              boxSizing: "border-box",
              background: popupBg,
              border: `1px solid ${popupBorder}`,
              borderRadius: isResponsiveCalendar ? "22px 22px 0 0" : 18,
              boxShadow: dark
                ? "0 24px 60px -16px rgba(0,0,0,.6)"
                : "0 24px 56px -14px rgba(13,38,102,.34)",
              padding: isResponsiveCalendar
                ? "8px 20px 18px"
                : priceCalendar
                  ? "18px 16px 14px"
                  : "18px 20px",
              zIndex: isModalCalendar ? 1200 : 200,
              color: dark ? "#e7ecf3" : undefined,
            }}
          >
            {isResponsiveCalendar && (
              <>
                <div
                  aria-hidden="true"
                  style={{
                    width: 40,
                    height: 4,
                    borderRadius: 999,
                    background: "#cfd5de",
                    margin: "2px auto 14px",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    direction: "ltr",
                    borderBottom: `1px solid ${popupBorder}`,
                    paddingBottom: 12,
                    marginBottom: 14,
                  }}
                >
                  <button
                    type="button"
                    aria-label={
                      locale === "en"
                        ? "Close"
                        : locale === "ar"
                          ? "إغلاق"
                          : "بستن"
                    }
                    data-testid={testId ? `${testId}-mobile-close` : undefined}
                    onClick={() => setOpen(false)}
                    style={{
                      border: 0,
                      background: "transparent",
                      color: mutedColor,
                      fontFamily: "inherit",
                      fontSize: 22,
                      lineHeight: 1,
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                  <strong
                    dir={isRTL ? "rtl" : "ltr"}
                    style={{
                      color: dark ? "#e7ecf3" : "#0d2640",
                      fontSize: 14,
                    }}
                  >
                    {label}
                  </strong>
                </div>
              </>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
              }}
            >
              {priceCalendar && (
                <span
                  style={{
                    marginInlineStart: "auto",
                    padding: "7px 15px",
                    border: `1.5px solid ${popupBorder}`,
                    borderRadius: 22,
                    color: mutedColor,
                    fontSize: "11.5px",
                    fontWeight: 700,
                  }}
                >
                  {locale === "en"
                    ? "Gregorian calendar"
                    : locale === "ar"
                      ? "التقويم الميلادي"
                      : "تقویم شمسی"}
                </span>
              )}
              <span
                data-testid={testId ? `${testId}-today` : undefined}
                onClick={() => {
                  const today = dayjs().calendar(calendarSystem);
                  const iso = toIsoDateOnly(today);
                  if (minIso && iso < minIso.slice(0, 10)) return;
                  setViewMonth(today);
                  setViewMode("day");
                  if (priceCalendar) {
                    setDraftIso(iso);
                  } else {
                    onChange(isoDateAtNoon(iso));
                    setOpen(false);
                  }
                }}
                style={{
                  padding: "7px 15px",
                  border: "1.5px solid #1668c4",
                  borderRadius: 22,
                  color: "#1668c4",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {locale === "en"
                  ? "Today"
                  : locale === "ar"
                    ? "اليوم"
                    : "تاریخ امروز"}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                direction: "ltr",
                marginBottom: 12,
              }}
            >
              <button
                type="button"
                aria-label={isRTL && rtlForwardArrow ? (locale === "ar" ? "التالي" : "بعدی") : locale === "en" ? "Previous" : "قبلی"}
                data-testid={testId ? `${testId}-${isRTL && rtlForwardArrow ? "next" : "previous"}-month` : undefined}
                onClick={() =>
                  setViewMonth(
                    viewMonth[isRTL && rtlForwardArrow ? "add" : "subtract"](
                      viewMode === "day" ? 1 : viewMode === "month" ? 1 : 12,
                      viewMode === "day" ? "month" : "year",
                    ),
                  )
                }
                style={{
                  width: 36,
                  height: 36,
                  border: `1.5px solid ${dark ? "#2a3550" : "#e6eaf0"}`,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#1668c4",
                  fontSize: "14.5px",
                  cursor: "pointer",
                  background: "transparent",
                }}
              >
                ‹
              </button>
              <button
                type="button"
                disabled={!granularNavigation}
                data-testid={testId ? `${testId}-month-label` : undefined}
                onClick={() =>
                  granularNavigation &&
                  setViewMode((mode) =>
                    mode === "day" ? "month" : mode === "month" ? "year" : "month",
                  )
                }
                aria-disabled={!granularNavigation}
                style={{
                  textAlign: "center",
                  fontSize: "13.5px",
                  fontWeight: 800,
                  color: dark ? "#e7ecf3" : "#0d2640",
                  border: 0,
                  background: "transparent",
                  cursor: granularNavigation ? "pointer" : "default",
                  fontFamily: "inherit",
                }}
              >
                {viewMode === "day"
                  ? localeMonthYear(viewMonth, locale)
                  : viewMode === "month"
                    ? localeDigits(viewMonth.year(), locale)
                    : `${localeDigits(yearRangeStart, locale)} – ${localeDigits(yearRangeStart + 11, locale)}`}
              </button>
              <button
                type="button"
                aria-label={isRTL && rtlForwardArrow ? (locale === "ar" ? "السابق" : "قبلی") : locale === "en" ? "Next" : "بعدی"}
                data-testid={testId ? `${testId}-${isRTL && rtlForwardArrow ? "previous" : "next"}-month` : undefined}
                onClick={() =>
                  setViewMonth(
                    viewMonth[isRTL && rtlForwardArrow ? "subtract" : "add"](
                      viewMode === "day" ? 1 : viewMode === "month" ? 1 : 12,
                      viewMode === "day" ? "month" : "year",
                    ),
                  )
                }
                style={{
                  width: 36,
                  height: 36,
                  border: `1.5px solid ${dark ? "#2a3550" : "#e6eaf0"}`,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#1668c4",
                  fontSize: "14.5px",
                  cursor: "pointer",
                  background: "transparent",
                }}
              >
                ›
              </button>
            </div>

            {viewMode === "day" && (
            <><div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7,1fr)",
                gap: 2,
                marginBottom: 6,
              }}
            >
              {localeWeekdays[locale].map((w) => (
                <span
                  key={w}
                  style={{
                    textAlign: "center",
                    fontSize: 10,
                    color: dark ? "#a8b5c8" : "#65758b",
                    fontWeight: 700,
                  }}
                >
                  {w}
                </span>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7,1fr)",
                gap: 2,
              }}
            >
              {cells.map((c, i) => {
                if (!c) return <span key={`blank-${i}`} />;
                const isSelected = selectedIsoDay === c.iso;
                const price = prices[c.iso];
                const hasPrice = price != null && !isPriceCalendarEmpty(price);
                return (
                  <span
                    key={c.iso}
                    data-testid={testId ? `${testId}-day-${c.date}` : undefined}
                    onClick={() => {
                      if (c.disabled) return;
                      if (priceCalendar) {
                        setDraftIso(c.iso);
                      } else {
                        onChange(isoDateAtNoon(c.iso));
                        setOpen(false);
                      }
                    }}
                    style={{
                      minHeight: priceCalendar ? 44 : 36,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11.5px",
                      fontWeight: isSelected ? 800 : 500,
                      color: c.disabled
                        ? dark
                          ? "#3a4558"
                          : "#8a98aa"
                        : isSelected
                          ? "#fff"
                          : dark
                            ? "#e7ecf3"
                            : "#16202e",
                      background: isSelected
                        ? "#3f6fc6"
                        : priceCalendar
                          ? dark
                            ? "#172236"
                            : "#fff"
                          : "transparent",
                      border: priceCalendar
                        ? `1px solid ${isSelected ? "#3f6fc6" : popupBorder}`
                        : undefined,
                      borderRadius: 10,
                      cursor: c.disabled ? "not-allowed" : "pointer",
                    }}
                  >
                    {localeDigits(c.date, locale)}
                    {priceCalendar && hasPrice && (
                      <small
                        data-testid={
                          testId ? `${testId}-price-${c.iso}` : undefined
                        }
                        title={formatPriceCalendarPrice(
                          price,
                          priceCalendar.locale,
                          priceCalendarCopy(priceCalendar.locale).emptyDay,
                        )}
                        style={{
                          marginTop: 3,
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontSize: 8,
                          lineHeight: 1.2,
                          color: isSelected ? "#fff" : "#1f8a5b",
                          direction: "ltr",
                        }}
                      >
                        {formatPriceCalendarPrice(
                          price,
                          priceCalendar.locale,
                          priceCalendarCopy(priceCalendar.locale).emptyDay,
                        )}
                      </small>
                    )}
                  </span>
                );
              })}
            </div></>
            )}
            {viewMode === "month" && (
              <div
                data-testid={testId ? `${testId}-month-grid` : undefined}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 8,
                  minHeight: 250,
                  alignContent: "start",
                }}
              >
                {Array.from({ length: 12 }, (_, monthIndex) => {
                  const month = viewMonth.month(monthIndex);
                  const selected = monthIndex === viewMonth.month();
                  return (
                    <button
                      type="button"
                      key={monthIndex}
                      data-testid={testId ? `${testId}-month-${monthIndex}` : undefined}
                      onClick={() => {
                        setViewMonth(viewMonth.month(monthIndex));
                        setViewMode("day");
                      }}
                      style={{
                        height: 44,
                        border: `1px solid ${selected ? "#3f6fc6" : popupBorder}`,
                        borderRadius: 10,
                        background: selected ? "#3f6fc6" : "transparent",
                        color: selected ? "#fff" : dark ? "#e7ecf3" : "#16202e",
                        fontFamily: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      {localeMonthName(month, locale)}
                    </button>
                  );
                })}
              </div>
            )}
            {viewMode === "year" && (
              <div
                data-testid={testId ? `${testId}-year-grid` : undefined}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 8,
                  minHeight: 250,
                  alignContent: "start",
                }}
              >
                {Array.from({ length: 12 }, (_, offset) => yearRangeStart + offset).map(
                  (year) => {
                    const selected = year === viewMonth.year();
                    return (
                      <button
                        type="button"
                        key={year}
                        data-testid={testId ? `${testId}-year-${year}` : undefined}
                        onClick={() => {
                          setViewMonth(viewMonth.year(year));
                          setViewMode("month");
                        }}
                        style={{
                          height: 44,
                          border: `1px solid ${selected ? "#3f6fc6" : popupBorder}`,
                          borderRadius: 10,
                          background: selected ? "#3f6fc6" : "transparent",
                          color: selected ? "#fff" : dark ? "#e7ecf3" : "#16202e",
                          fontFamily: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        {localeDigits(year, locale)}
                      </button>
                    );
                  },
                )}
              </div>
            )}
            {priceCalendar && viewMode === "day" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  borderTop: `1px solid ${popupBorder}`,
                  marginTop: 14,
                  paddingTop: 12,
                }}
              >
                <span
                  style={{
                    color: pricesError ? "#c2410c" : mutedColor,
                    fontSize: 11,
                  }}
                >
                  {pricesLoading
                    ? priceCalendarCopy(priceCalendar.locale).loading
                    : pricesError
                      ? priceCalendarCopy(priceCalendar.locale).error
                      : draftIso
                        ? formatLocaleDate(isoDateAtNoon(draftIso), locale)
                        : ""}
                </span>
                <button
                  type="button"
                  data-testid={testId ? `${testId}-confirm` : undefined}
                  disabled={!draftIso}
                  onClick={() => {
                    if (!draftIso) return;
                    onChange(isoDateAtNoon(draftIso));
                    setOpen(false);
                  }}
                  style={{
                    border: 0,
                    borderRadius: 10,
                    background: draftIso ? "#3f6fc6" : "#ccd3dd",
                    color: "#fff",
                    padding: "10px 24px",
                    fontFamily: "inherit",
                    fontWeight: 800,
                    cursor: draftIso ? "pointer" : "not-allowed",
                  }}
                >
                  {priceCalendar.locale === "en"
                    ? "Confirm"
                    : priceCalendar.locale === "ar"
                      ? "تأكيد"
                      : "تأیید"}
                </button>
              </div>
            )}
          </div>
        </CalendarPortal>
      )}
    </div>
  );
}
