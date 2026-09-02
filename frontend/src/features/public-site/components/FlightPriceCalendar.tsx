import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPriceCalendar } from '../../../api/publicSite';
import type { StoredLocale } from '../../../hooks/useLocale';
import {
  findCheapestPriceCalendarDate,
  formatPriceCalendarDayParts,
  formatPriceCalendarPrice,
  priceCalendarCopy,
} from '../../../lib/price-calendar';
import type { CabinClass, PriceCalendarDay } from '../../../types/public-site';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

const CALENDAR_PAGE_DAYS = 6;

function shiftIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function FlightPriceCalendar({
  origin,
  dest,
  selectedDate,
  locale,
  cabin,
  onSelectDate,
  compact = false,
}: {
  origin: string;
  dest: string;
  selectedDate: string;
  locale: StoredLocale;
  cabin?: CabinClass;
  onSelectDate: (isoDate: string) => void;
  /** Slightly tighter padding for embedding under the home search card. */
  compact?: boolean;
}) {
  const copy = priceCalendarCopy(locale);
  const isRTL = locale !== 'en';
  const [days, setDays] = useState<PriceCalendarDay[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [reloadKey, setReloadKey] = useState(0);
  const [calendarCenter, setCalendarCenter] = useState(selectedDate.slice(0, 10));
  const [activeDate, setActiveDate] = useState(selectedDate.slice(0, 10));
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [slideFrom, setSlideFrom] = useState<'left' | 'right' | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);
  const routeKey = `${origin}|${dest}`;
  const routeKeyRef = useRef(routeKey);
  const visibleDateSetRef = useRef<Set<string>>(new Set());
  const daysRef = useRef<PriceCalendarDay[]>([]);
  const requestSequenceRef = useRef(0);
  const pendingSlideFromRef = useRef<'left' | 'right' | null>(null);

  useEffect(() => {
    const normalizedSelectedDate = selectedDate.slice(0, 10);
    const routeChanged = routeKeyRef.current !== routeKey;
    routeKeyRef.current = routeKey;
    setActiveDate(normalizedSelectedDate);
    pendingSlideFromRef.current = null;
    setSlideFrom(null);
    setCalendarCenter((current) => {
      if (!routeChanged && visibleDateSetRef.current.has(normalizedSelectedDate)) {
        return current;
      }
      return normalizedSelectedDate;
    });
  }, [routeKey, selectedDate]);

  const load = useCallback(async () => {
    const requestId = ++requestSequenceRef.current;
    const keepsCurrentStrip = daysRef.current.length > 0;
    const requestedSlideFrom = pendingSlideFromRef.current;
    if (!origin || !dest || !calendarCenter) {
      setDays([]);
      daysRef.current = [];
      setState('idle');
      setIsBrowsing(false);
      return;
    }
    if (keepsCurrentStrip) setIsBrowsing(true);
    else setState('loading');
    try {
      const data = cabin
        ? await fetchPriceCalendar(origin, dest, calendarCenter, cabin)
        : await fetchPriceCalendar(origin, dest, calendarCenter);
      if (requestId !== requestSequenceRef.current) return;
      const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
      daysRef.current = sorted;
      setDays(sorted);
      setState(data.length === 0 ? 'empty' : 'ready');
      setSlideFrom(requestedSlideFrom);
      setRenderVersion((version) => version + 1);
    } catch {
      if (requestId !== requestSequenceRef.current) return;
      if (keepsCurrentStrip) setState('ready');
      else {
        setDays([]);
        daysRef.current = [];
        setState('error');
      }
    } finally {
      if (requestId === requestSequenceRef.current) setIsBrowsing(false);
    }
  }, [origin, dest, calendarCenter, cabin]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const cheapestDate = useMemo(() => findCheapestPriceCalendarDate(days), [days]);
  const visibleDays = days.slice(0, CALENDAR_PAGE_DAYS);
  visibleDateSetRef.current = new Set(visibleDays.map((day) => day.date));
  const orderedVisibleDays = isRTL ? [...visibleDays].reverse() : visibleDays;
  const previousDaysLabel =
    locale === 'fa' ? 'روز قبل' : locale === 'ar' ? 'اليوم السابق' : 'Previous day';
  const nextDaysLabel =
    locale === 'fa' ? 'روز بعد' : locale === 'ar' ? 'اليوم التالي' : 'Next day';

  function scrollCalendar(delta: -1 | 1, visualFrom: 'left' | 'right') {
    // Arrows browse the nearby-price window only. The passenger's chosen
    // travel date stays selected (blue) until they click a day card itself.
    pendingSlideFromRef.current = visualFrom;
    setIsBrowsing(true);
    setCalendarCenter((current) => shiftIsoDate(current, delta));
  }

  if (!origin || !dest || !selectedDate) return null;

  return (
    <section
      data-testid="price-calendar"
      dir={isRTL ? 'rtl' : 'ltr'}
      aria-label={copy.title}
      className={compact ? 'mt-3 w-full' : 'mx-auto w-full px-3 pt-3 sm:px-[26px] sm:pt-4'}
      style={{
        maxWidth: compact ? '100%' : 1320,
        margin: compact ? '12px 0 0' : undefined,
        padding: compact ? 0 : undefined,
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <div
        style={{
          background: '#fff',
          border: '1px solid #eef1f5',
          borderRadius: 14,
          padding: compact ? 12 : 16,
          boxSizing: 'border-box',
          maxWidth: '100%',
        }}
      >
        {state === 'loading' && (
          <div data-testid="price-calendar-loading" style={{ fontSize: 13, color: '#5a6678', padding: '10px 4px' }}>
            {copy.loading}
          </div>
        )}

        {state === 'error' && (
          <div
            data-testid="price-calendar-error"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              background: '#fff4e8',
              border: '1px solid #f6dcbb',
              color: '#c2410c',
              borderRadius: 12,
              padding: '10px 12px',
              fontSize: 13.5,
            }}
          >
            <span>{copy.error}</span>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              style={{
                border: 'none',
                background: '#1668c4',
                color: '#fff',
                borderRadius: 9,
                padding: '7px 14px',
                fontWeight: 800,
                fontSize: 12.5,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {copy.retry}
            </button>
          </div>
        )}

        {state === 'empty' && (
          <div data-testid="price-calendar-empty" style={{ fontSize: 13, color: '#8a96a6', padding: '10px 4px' }}>
            {copy.emptyDay}
          </div>
        )}

        {state === 'ready' && (
          <div
            data-testid="price-calendar-strip"
            dir="ltr"
            aria-busy={isBrowsing}
            aria-live="polite"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              overflowX: 'hidden',
              overflowY: 'visible',
              paddingBottom: 2,
              paddingTop: 10,
              maxWidth: '100%',
            }}
          >
            <button
              type="button"
              data-testid={isRTL ? 'price-calendar-next' : 'price-calendar-previous'}
              aria-label={isRTL ? nextDaysLabel : previousDaysLabel}
              onClick={() => scrollCalendar(isRTL ? 1 : -1, 'left')}
              style={{ width: 40, height: 40, flex: '0 0 40px', borderRadius: 999, border: '1px solid #e6eaf0', background: '#fff', color: '#1668c4', cursor: 'pointer', fontSize: 21, lineHeight: 1 }}
            >
              ‹
            </button>
            <div
              key={renderVersion}
              data-testid="price-calendar-days-track"
              data-slide-from={slideFrom ?? 'none'}
              className={slideFrom ? `price-calendar-slide-from-${slideFrom}` : undefined}
              style={{
                display: 'flex',
                alignItems: 'stretch',
                gap: 8,
                flex: '1 1 0',
                minWidth: 0,
                maxWidth: '100%',
              }}
            >
            {orderedVisibleDays.map((day) => {
              const selected = day.date === activeDate;
              const isCheapest = cheapestDate != null && day.date === cheapestDate;
              const empty = formatPriceCalendarPrice(day.minPriceIrr, locale, copy.emptyDay) === copy.emptyDay;
              const parts = formatPriceCalendarDayParts(day.date, locale);
              const priceStr = formatPriceCalendarPrice(day.minPriceIrr, locale, copy.emptyDay);
              const border = selected ? '#1668c4' : '#e6eaf0';
              const bg = selected ? '#1668c4' : '#fff';
              const color = selected ? '#fff' : '#0d2640';
              const subColor = selected ? '#fff' : '#5a6678';
              const priceColor = empty
                ? selected
                  ? '#d9e8fb'
                  : '#8a96a6'
                : selected
                  ? '#fff'
                  : isCheapest
                    ? '#1f8a5b'
                    : '#3b4554';

              return (
                <button
                  key={day.date}
                  type="button"
                  data-testid={`price-calendar-day-${day.date}`}
                  data-visible-testid={`price-calendar-visible-day-${day.date}`}
                  data-selected={selected ? 'true' : 'false'}
                  data-empty={empty ? 'true' : 'false'}
                  aria-pressed={selected}
                  dir={isRTL ? 'rtl' : 'ltr'}
                  onClick={() => {
                    setActiveDate(day.date);
                    onSelectDate(day.date);
                  }}
                  style={{
                    flex: compact ? '1 0 104px' : '1 1 0',
                    minWidth: compact ? 104 : 0,
                    maxWidth: compact ? 128 : 'none',
                    minHeight: compact ? 104 : 120,
                    cursor: 'pointer',
                    borderRadius: 12,
                    border: `1.5px solid ${border}`,
                    background: bg,
                    padding: '14px 8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 5,
                    textAlign: 'center',
                    position: 'relative',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                >
                  <span data-testid={`price-calendar-visible-day-${day.date}`} style={{ display: 'none' }} />
                  {isCheapest && !empty && (
                    <span
                      data-testid={`price-calendar-cheapest-${day.date}`}
                      style={{
                        position: 'absolute',
                        top: -9,
                        background: '#1f8a5b',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 20,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {copy.cheapest}
                    </span>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 700, color: subColor }}>{parts.weekday}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color }}>{parts.dateStr}</span>
                  <span
                    className="font-num"
                    style={{ fontSize: 13, fontWeight: 800, color: priceColor, whiteSpace: 'nowrap' }}
                  >
                    {priceStr}
                    {!empty && (
                      <span style={{ marginInlineStart: 3, fontSize: 10, fontWeight: 700 }}>
                        {copy.currency}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            </div>
            <button
              type="button"
              data-testid={isRTL ? 'price-calendar-previous' : 'price-calendar-next'}
              aria-label={isRTL ? previousDaysLabel : nextDaysLabel}
              onClick={() => scrollCalendar(isRTL ? -1 : 1, 'right')}
              style={{ width: 40, height: 40, flex: '0 0 40px', borderRadius: 999, border: '1px solid #e6eaf0', background: '#fff', color: '#1668c4', cursor: 'pointer', fontSize: 21, lineHeight: 1 }}
            >
              ›
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
