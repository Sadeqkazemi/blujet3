import { useEffect, useMemo, useState } from 'react';
import { fetchAirports, fetchSearchCabins } from '../../../api/publicSite';
import type { StoredLocale } from '../../../hooks/useLocale';
import { airportCityLabel, airportCityName, airportName } from '../../../lib/airport-cities';
import { dayjs, toIsoDateOnly } from '../../../lib/jalali';
import {
  calendarForLocale,
  calendarOffset,
  formatLocaleDate,
  localeDigits,
  localeMonthYear,
  localeWeekdays,
} from '../../../lib/locale-format';
import type { Airport, CabinClass } from '../../../types/public-site';
import {
  airportsForSearchScope,
  type FlightSearchScope,
} from '../../../lib/airport-search-scope';
import {
  airportsOutsideSelectedCity,
  airportsShareCity,
} from '../../../lib/airport-route-options';
import {
  normalizePassengerMix,
  type PassengerMix,
} from '../checkout/checkout-types';
import type { ResultsCopy } from './results-copy';
import { parseCabinParam } from './results-utils';
import './ResultsEditSearchModal.css';

type Props = {
  open: boolean;
  locale: StoredLocale;
  copy: ResultsCopy;
  origin: string;
  dest: string;
  date: string;
  returnDate?: string;
  passengerMix: PassengerMix;
  cabin: CabinClass;
  scope: FlightSearchScope;
  onClose: () => void;
  onApply: (
    origin: string,
    dest: string,
    date: string,
    returnDate: string | undefined,
    passengerMix: PassengerMix,
    cabin: CabinClass,
  ) => void;
};

type CalCell = { label: string; iso: string | null; disabled: boolean; selected: boolean };

function airportDisplayLabel(airport: Airport, locale: StoredLocale) {
  return airportCityLabel(airport.code, locale, airport.cityFa);
}

function formatDateDisplay(isoDay: string, locale: StoredLocale) {
  return formatLocaleDate(`${isoDay}T12:00:00Z`, locale);
}

function buildCalendarCells(viewMonth: ReturnType<typeof dayjs>, selectedIso: string, locale: StoredLocale): CalCell[] {
  const today = dayjs().startOf('day');
  const start = viewMonth.startOf('month');
  const offset = calendarOffset(start, locale);
  const daysInMonth = viewMonth.daysInMonth();
  const cells: CalCell[] = [];

  for (let i = 0; i < offset; i++) {
    cells.push({ label: '', iso: null, disabled: true, selected: false });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const day = start.add(d - 1, 'day');
    const iso = toIsoDateOnly(day);
    const disabled = day.isBefore(today, 'day');
    cells.push({
      label: localeDigits(d, locale),
      iso,
      disabled,
      selected: iso === selectedIso,
    });
  }

  return cells;
}

function AirportPicker({
  label,
  value,
  airports,
  locale,
  copy,
  onChange,
}: {
  label: string;
  value: string;
  airports: Airport[];
  locale: StoredLocale;
  copy: ResultsCopy;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = airports.find((a) => a.code === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return airports;
    return airports.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.cityFa.includes(query.trim()) ||
        airportCityName(a.code, locale, a.cityFa).toLowerCase().includes(q) ||
        airportDisplayLabel(a, locale).toLowerCase().includes(q),
    );
  }, [airports, query, locale]);

  return (
    <div className="results-edit-search-airport" style={{ flex: 1, minWidth: 180, position: 'relative' }}>
      <div style={{ fontSize: 13, color: '#8a96a6', marginBottom: 7, fontWeight: 600 }}>{label}</div>
      <button
        type="button"
        data-testid={`edit-search-${label === copy.fromLabel ? 'origin' : 'dest'}`}
        className="results-edit-search-airport-button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          height: 50,
          border: '1.5px solid #e2e7ee',
          borderRadius: 11,
          background: '#fafbfd',
          padding: '0 11px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#16202e' }}>
          {selected ? airportDisplayLabel(selected, locale) : '—'}
        </span>
        <span style={{ fontSize: 12, color: '#6b7787' }}>▼</span>
      </button>
      {open && (
        <>
          <div
            className="results-edit-search-airport-menu"
            onClick={() => {
              setOpen(false);
              setQuery('');
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 238 }}
          />
          <div
            style={{
              position: 'absolute',
              top: 80,
              right: 0,
              width: 318,
              maxWidth: '88vw',
              background: '#fff',
              border: '1px solid #e6eaf0',
              borderRadius: 14,
              boxShadow: '0 18px 44px -12px rgba(13,38,102,.30)',
              padding: 13,
              zIndex: 240,
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={copy.cityQueryPlaceholder}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: 42,
                border: '1.5px solid #e2e7ee',
                borderRadius: 10,
                padding: '0 12px',
                fontSize: 13.5,
                fontFamily: 'inherit',
                outline: 'none',
                marginBottom: 9,
              }}
            />
            <div style={{ fontSize: 12.5, color: '#6b7787', fontWeight: 700, margin: '0 4px 6px' }}>
              {copy.citiesWithAirportLabel}
            </div>
            <div style={{ maxHeight: 248, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {filtered.map((a) => (
                <button
                  key={a.code}
                  type="button"
                  data-testid={`edit-airport-option-${a.code}`}
                  onClick={() => {
                    onChange(a.code);
                    setOpen(false);
                    setQuery('');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '8px 7px',
                    borderRadius: 9,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    textAlign: 'inherit',
                    width: '100%',
                  }}
                >
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: '#eef4fb',
                      color: '#1668c4',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 'none',
                    }}
                  >
                    ✈
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16202e' }}>
                      {airportDisplayLabel(a, locale)}
                    </div>
                    <div style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: '#8a96a6' }}>
                      {airportName(a.code, locale, a.airportNameFa)}
                    </div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: 15, textAlign: 'center', fontSize: 13.5, color: '#6b7787' }}>
                  {copy.noCityFoundLabel}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ResultsEditSearchModal({
  open,
  locale,
  copy,
  origin,
  dest,
  date,
  returnDate = '',
  passengerMix,
  cabin,
  scope,
  onClose,
  onApply,
}: Props) {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [availableCabins, setAvailableCabins] = useState<CabinClass[]>([cabin]);
  const [tripType, setTripType] = useState<'oneway' | 'round'>('oneway');
  const [draftOrigin, setDraftOrigin] = useState(origin);
  const [draftDest, setDraftDest] = useState(dest);
  const [draftDate, setDraftDate] = useState(date);
  const [draftReturnDate, setDraftReturnDate] = useState('');
  const [draftAdults, setDraftAdults] = useState(passengerMix.adults);
  const [draftChildren, setDraftChildren] = useState(passengerMix.children);
  const [draftInfants, setDraftInfants] = useState(passengerMix.infants);
  const [paxOpen, setPaxOpen] = useState(false);
  const [draftClass, setDraftClass] = useState<CabinClass>(cabin);
  const [calOpen, setCalOpen] = useState(false);
  const [calTarget, setCalTarget] = useState<'departure' | 'return'>('departure');
  const [applying, setApplying] = useState(false);
  const [viewMonth, setViewMonth] = useState(() =>
    dayjs(`${date}T12:00:00Z`).calendar(calendarForLocale(locale)),
  );

  useEffect(() => {
    if (!open) return;
    const mix = normalizePassengerMix({
      adults: passengerMix.adults,
      children: passengerMix.children,
      infants: passengerMix.infants,
    });
    setDraftOrigin(origin);
    setDraftDest(dest);
    setDraftDate(date);
    setDraftReturnDate(returnDate);
    setDraftAdults(mix.adults);
    setDraftChildren(mix.children);
    setDraftInfants(mix.infants);
    setDraftClass(cabin);
    setTripType(returnDate ? 'round' : 'oneway');
    setCalOpen(false);
    setApplying(false);
    setViewMonth(dayjs(`${date}T12:00:00Z`).calendar(calendarForLocale(locale)));
    fetchAirports().then(setAirports).catch(() => setAirports([]));
    fetchSearchCabins()
      .then((rows) => {
        const cabins = rows.length > 0 ? rows : [cabin];
        setAvailableCabins(cabins);
        setDraftClass(cabins.includes(cabin) ? cabin : cabins[0]);
      })
      .catch(() => setAvailableCabins([cabin]));
  }, [
    open,
    origin,
    dest,
    date,
    returnDate,
    passengerMix.adults,
    passengerMix.children,
    passengerMix.infants,
    cabin,
    locale,
  ]);

  const scopedAirports = useMemo(
    () => airportsForSearchScope(airports, scope),
    [airports, scope],
  );

  const weekdays = localeWeekdays[locale];
  const calTitle = localeMonthYear(viewMonth, locale);
  const selectedIso = calTarget === 'departure' ? draftDate : draftReturnDate || draftDate;
  const calCells = buildCalendarCells(viewMonth, selectedIso, locale);
  const calTargetLabel = calTarget === 'departure' ? copy.departureDateLabel : copy.returnDateLabel;

  const classOptions = useMemo(
    () => availableCabins.map((value) => ({
      value,
      label:
        value === 'ECONOMY'
          ? copy.economyLabel
          : value === 'COMFORT'
            ? copy.comfortLabel
            : value === 'BUSINESS'
              ? locale === 'en'
                ? 'Business'
                : locale === 'ar'
                  ? 'رجال الأعمال'
                  : 'بیزنس'
              : locale === 'en'
                ? 'First class'
                : locale === 'ar'
                  ? 'الدرجة الأولى'
                  : 'فرست کلاس',
    })),
    [availableCabins, copy.comfortLabel, copy.economyLabel, locale],
  );

  const paxRows = useMemo(
    () => [
      {
        key: 'adults',
        label:
          locale === 'en' ? 'Adults' : locale === 'ar' ? 'بالغون' : 'بزرگسال',
        val: draftAdults,
        dec: () =>
          setDraftAdults((n) => {
            const next = Math.max(1, n - 1);
            setDraftInfants((inf) => Math.min(inf, next));
            return next;
          }),
        inc: () => setDraftAdults((n) => n + 1),
      },
      {
        key: 'children',
        label:
          locale === 'en' ? 'Children' : locale === 'ar' ? 'أطفال' : 'کودک',
        val: draftChildren,
        dec: () => setDraftChildren((n) => Math.max(0, n - 1)),
        inc: () => setDraftChildren((n) => n + 1),
      },
      {
        key: 'infants',
        label:
          locale === 'en' ? 'Infants' : locale === 'ar' ? 'رضّع' : 'نوزاد',
        val: draftInfants,
        dec: () => setDraftInfants((n) => Math.max(0, n - 1)),
        inc: () =>
          setDraftInfants((n) => Math.min(draftAdults, n + 1)),
      },
    ],
    [draftAdults, draftChildren, draftInfants, locale],
  );

  function openCalendar(target: 'departure' | 'return') {
    setCalTarget(target);
    setCalOpen(true);
    const iso = target === 'departure' ? draftDate : draftReturnDate || draftDate;
    setViewMonth(dayjs(`${iso}T12:00:00Z`).calendar(calendarForLocale(locale)));
  }

  function handleApply() {
    if (airportsShareCity(scopedAirports, draftOrigin, draftDest) || applying) return;
    setApplying(true);
    const mix = normalizePassengerMix({
      adults: draftAdults,
      children: draftChildren,
      infants: draftInfants,
    });
    onApply(
      draftOrigin,
      draftDest,
      draftDate,
      tripType === 'round' && draftReturnDate ? draftReturnDate : undefined,
      mix,
      parseCabinParam(draftClass),
    );
  }

  if (!open) return null;

  return (
    <div
      className="results-edit-search-overlay"
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(13,38,64,.55)',
        zIndex: 220,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 16,
        overflow: 'auto',
      }}
    >
      <div
        className="results-edit-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={copy.editSearchLabel}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 18,
          width: 850,
          maxWidth: '100%',
          margin: 'auto',
          boxShadow: '0 30px 70px -20px rgba(0,0,0,.5)',
        }}
      >
        <div
          className="results-edit-search-header"
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e6eaf0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 16.5, fontWeight: 800, color: '#0d2640' }}>{copy.editSearchLabel}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            style={{ cursor: 'pointer', color: '#6b7787', fontSize: 22.5, lineHeight: 1, background: 'none', border: 'none' }}
          >
            ×
          </button>
        </div>

        <div className="results-edit-search-body" style={{ padding: '15px 16px' }}>
          <div className="results-edit-search-trip-types" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(
              [
                ['oneway', copy.tripOneWay],
                ['round', copy.tripRoundTrip],
              ] as const
            ).map(([key, label]) => {
              const active = tripType === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTripType(key)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 22,
                    border: `1.5px solid ${active ? '#1668c4' : '#e2e7ee'}`,
                    background: active ? '#eef4fb' : '#fff',
                    color: active ? '#1668c4' : '#5a6678',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div data-testid="edit-search-route" className="results-edit-search-route" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <AirportPicker
              label={copy.fromLabel}
              value={draftOrigin}
              airports={airportsOutsideSelectedCity(scopedAirports, draftDest)}
              locale={locale}
              copy={copy}
              onChange={(code) => {
                setDraftOrigin(code);
                if (airportsShareCity(scopedAirports, code, draftDest)) setDraftDest('');
              }}
            />
            <button
              type="button"
              onClick={() => {
                setDraftOrigin(draftDest);
                setDraftDest(draftOrigin);
              }}
              aria-label={copy.changeSearch}
              className="results-edit-search-swap"
              style={{
                width: 44,
                height: 44,
                flex: 'none',
                marginBottom: 3,
                borderRadius: '50%',
                border: '1.5px solid #e2e7ee',
                background: '#fff',
                color: '#1668c4',
                fontSize: 17,
                cursor: 'pointer',
              }}
            >
              <span className="results-edit-search-swap-icon" aria-hidden="true">⇄</span>
            </button>
            <AirportPicker
              label={copy.toLabel}
              value={draftDest}
              airports={airportsOutsideSelectedCity(scopedAirports, draftOrigin)}
              locale={locale}
              copy={copy}
              onChange={(code) => {
                setDraftDest(code);
                if (airportsShareCity(scopedAirports, draftOrigin, code)) setDraftOrigin('');
              }}
            />
          </div>

          <div data-testid="edit-search-controls" className="results-edit-search-controls" style={{ display: 'grid', gridTemplateColumns: tripType === 'round' ? 'repeat(4,minmax(0,1fr))' : 'repeat(3,minmax(0,1fr))', gap: 10, marginTop: 14 }}>
            <div className="results-edit-search-date-control" style={{ flex: 1, minWidth: 160, position: 'relative' }}>
              <div style={{ fontSize: 13, color: '#8a96a6', marginBottom: 7, fontWeight: 600 }}>{copy.departureDateLabel}</div>
              <button
                type="button"
                data-testid="edit-search-date"
                onClick={() => openCalendar('departure')}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  height: 50,
                  border: '1.5px solid #e2e7ee',
                  borderRadius: 11,
                  background: '#fafbfd',
                  padding: '0 11px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 13.5,
                  color: '#16202e',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span>{formatDateDisplay(draftDate, locale)}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a96a6" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M8 3v4M16 3v4M3 10h18" />
                </svg>
              </button>
            </div>

            {tripType === 'round' && (
              <div className="results-edit-search-date-control" style={{ flex: 1, minWidth: 160, position: 'relative' }}>
                <div style={{ fontSize: 13, color: '#8a96a6', marginBottom: 7, fontWeight: 600 }}>{copy.returnDateLabel}</div>
                <button
                  type="button"
                  data-testid="edit-search-return-date"
                  onClick={() => openCalendar('return')}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    height: 50,
                    border: '1.5px solid #e2e7ee',
                    borderRadius: 11,
                    background: '#fafbfd',
                    padding: '0 11px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 13.5,
                    color: '#16202e',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span>{draftReturnDate ? formatDateDisplay(draftReturnDate, locale) : '—'}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a96a6" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M8 3v4M16 3v4M3 10h18" />
                  </svg>
                </button>
              </div>
            )}

            <div className="results-edit-search-passenger-control" style={{ position: 'relative', minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#8a96a6', marginBottom: 7, fontWeight: 600 }}>{copy.paxCountLabel}</div>
              <button
                type="button"
                data-testid="edit-search-pax"
                onClick={() => setPaxOpen((value) => !value)}
                style={{
                  width: '100%',
                  height: 50,
                  border: '1.5px solid #e2e7ee',
                  borderRadius: 11,
                  background: '#fafbfd',
                  padding: '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#16202e',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <span>{localeDigits(draftAdults + draftChildren + draftInfants, locale)} {locale === 'fa' ? 'مسافر' : locale === 'ar' ? 'مسافر' : 'passengers'}</span>
                <span style={{ color: '#8a96a6' }}>⌄</span>
              </button>
              {paxOpen && (
                <div style={{ position: 'absolute', insetInlineStart: 0, top: 80, zIndex: 20, width: 290, background: '#fff', border: '1px solid #e2e7ee', borderRadius: 14, boxShadow: '0 18px 45px -14px rgba(13,38,64,.35)', padding: 12 }}>
                  {paxRows.map((row) => (
                  <div
                    key={row.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#16202e' }}>
                      {row.label}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        data-testid={`edit-search-pax-${row.key}-dec`}
                        onClick={row.dec}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          border: '1px solid #d7e0ec',
                          background: '#fff',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontWeight: 800,
                          color: '#1668c4',
                        }}
                      >
                        −
                      </button>
                      <span
                        data-testid={`edit-search-pax-${row.key}-val`}
                        style={{
                          minWidth: 18,
                          textAlign: 'center',
                          fontWeight: 800,
                          color: '#0d2640',
                          fontSize: 13.5,
                        }}
                      >
                        {localeDigits(row.val, locale)}
                      </span>
                      <button
                        type="button"
                        data-testid={`edit-search-pax-${row.key}-inc`}
                        onClick={row.inc}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          border: '1px solid #d7e0ec',
                          background: '#fff',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontWeight: 800,
                          color: '#1668c4',
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  ))}
                  <button type="button" onClick={() => setPaxOpen(false)} style={{ width: '100%', height: 40, marginTop: 8, border: 0, borderRadius: 10, background: '#1668c4', color: '#fff', fontFamily: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                    {locale === 'fa' ? 'تأیید' : locale === 'ar' ? 'تأكيد' : 'Confirm'}
                  </button>
                </div>
              )}
            </div>

            <div className="results-edit-search-cabin-control" style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 13, color: '#8a96a6', marginBottom: 7, fontWeight: 600 }}>{copy.flightClassLabel}</div>
              <select
                data-testid="edit-search-cabin"
                value={draftClass}
                onChange={(e) => setDraftClass(parseCabinParam(e.target.value))}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  height: 50,
                  border: '1.5px solid #e2e7ee',
                  borderRadius: 11,
                  background: '#fafbfd',
                  padding: '0 10px',
                  fontFamily: 'inherit',
                  fontSize: 13.5,
                  color: '#16202e',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {classOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {calOpen && (
            <div
            data-testid="edit-search-calendar"
              className="results-edit-search-calendar"
              style={{
                marginTop: 12,
                background: '#fff',
                border: '1.5px solid #e2e7ee',
                borderRadius: 14,
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1668c4', marginBottom: 8 }}>{calTargetLabel}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setViewMonth(viewMonth.subtract(1, 'month'))}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    border: '1.5px solid #e6eaf0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1668c4',
                    cursor: 'pointer',
                    background: '#fff',
                  }}
                >
                  ‹
                </button>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#0d2640' }}>{calTitle}</span>
                <button
                  type="button"
                  onClick={() => setViewMonth(viewMonth.add(1, 'month'))}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    border: '1.5px solid #e6eaf0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1668c4',
                    cursor: 'pointer',
                    background: '#fff',
                  }}
                >
                  ›
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 5 }}>
                {weekdays.map((w) => (
                  <span key={w} style={{ textAlign: 'center', fontSize: 12, color: '#6b7787', fontWeight: 700 }}>
                    {w}
                  </span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                {calCells.map((c, i) =>
                  c.iso ? (
                    <button
                      key={c.iso}
                      type="button"
                      disabled={c.disabled}
                      onClick={() => {
                        if (calTarget === 'departure') setDraftDate(c.iso!);
                        else setDraftReturnDate(c.iso!);
                        setCalOpen(false);
                      }}
                      style={{
                        height: 34,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 9,
                        fontSize: 13,
                        fontWeight: c.selected ? 800 : 600,
                        background: c.selected ? '#1668c4' : 'transparent',
                        color: c.disabled ? '#ccd3dd' : c.selected ? '#fff' : '#16202e',
                        cursor: c.disabled ? 'not-allowed' : 'pointer',
                        border: 'none',
                        fontFamily: 'inherit',
                      }}
                    >
                      {c.label}
                    </button>
                  ) : (
                    <span key={`blank-${i}`} />
                  ),
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            data-testid="edit-search-apply"
            className="results-edit-search-apply"
            disabled={applying || !draftOrigin || !draftDest || airportsShareCity(scopedAirports, draftOrigin, draftDest)}
            onClick={handleApply}
            style={{
              marginTop: 22,
              width: '100%',
              height: 52,
              borderRadius: 12,
              background: '#1668c4',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              fontSize: 14.5,
              fontWeight: 800,
              border: 'none',
              cursor: applying || !draftOrigin || !draftDest || airportsShareCity(scopedAirports, draftOrigin, draftDest) ? 'not-allowed' : 'pointer',
              opacity: applying || !draftOrigin || !draftDest || airportsShareCity(scopedAirports, draftOrigin, draftDest) ? 0.7 : 1,
              fontFamily: 'inherit',
            }}
          >
            {applying ? (
              <>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    border: '2.5px solid rgba(255,255,255,.35)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin .7s linear infinite',
                    display: 'inline-block',
                  }}
                />
                {copy.updatingLabel}
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4-4" />
                </svg>
                {copy.searchFlightsLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
