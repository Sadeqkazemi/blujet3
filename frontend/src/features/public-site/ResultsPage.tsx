import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  createPriceLock,
  fetchAirports,
  fetchClubPoints,
  fetchSearchAdvisory,
  searchFlights,
} from '../../api/publicSite';
import FlightPriceCalendar from './components/FlightPriceCalendar';
import { ApiRequestError } from '../../api/envelope';
import { useAuth } from '../../hooks/useAuth';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';
import { localeMoney } from '../../lib/fa-format';
import { formatLocaleDate, formatLocaleDateTime } from '../../lib/locale-format';
import { airportCityLabel, airportCityName } from '../../lib/airport-cities';
import type {
  Airport,
  CabinClass,
  PriceLock,
  SearchAdvisoryResult,
  SearchFlightResult,
} from '../../types/public-site';
import {
  normalizePassengerMix,
  type CheckoutDraft,
  type FlightSnapshot,
  type PassengerMix,
} from './checkout/checkout-types';
import PublicPageShell from '../../components/public/PublicPageShell';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import ResultsAiRadar from './results/ResultsAiRadar';
import ResultsEditSearchModal from './results/ResultsEditSearchModal';
import ResultsFlightCard from './results/ResultsFlightCard';
import { RESULTS_COPY } from './results/results-copy';
import {
  depHourBucket,
  flightAirlineLabel,
  formatPaxCabinMeta,
  parseCabinParam,
  primaryCabin,
  sortFlights,
} from './results/results-utils';
import {
  filterSellableSearchFlights,
  onSearchResultsInvalidate,
} from '../../lib/search-cache';
import type { FlightSearchScope } from '../../lib/airport-search-scope';

const GOLD_TIER_LEVELS = ['GOLD', 'PLATINUM'];
const ROUNDTRIP_OUTBOUND_KEY = 'blujet_roundtrip_outbound';

type OutboundLeg = NonNullable<CheckoutDraft['outboundLeg']>;
type RealLockResult =
  | { kind: 'success'; lock: PriceLock }
  | { kind: 'not-gold' }
  | { kind: 'error'; message: string };

const ERR: Record<StoredLocale, string> = {
  fa: 'خطا در ثبت قفل قیمت.',
  en: 'Could not save the price lock.',
  ar: 'تعذّر حفظ قفل السعر.',
};

function chipStyle(on: boolean): React.CSSProperties {
  return {
    cursor: 'pointer',
    borderRadius: 9,
    padding: '8px 13px',
    fontSize: 13,
    fontWeight: on ? 700 : 600,
    background: on ? '#1668c4' : '#f4f7fb',
    color: on ? '#fff' : '#5a6678',
    border: on ? '1.5px solid #1668c4' : '1px solid #eef1f5',
  };
}

export default function ResultsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { status } = useAuth();
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const isRTL = locale !== 'en';
  const copy = RESULTS_COPY[locale];

  const origin = params.get('origin') ?? '';
  const dest = params.get('dest') ?? '';
  const date = params.get('date') ?? '';
  const returnDate = params.get('returnDate') ?? '';
  const cabinClass = parseCabinParam(params.get('cabin'));
  const requestedScope = params.get('scope');
  const passengerMix = normalizePassengerMix({
    adults: Number(params.get('adults') || 1),
    children: Number(params.get('children') || 0),
    infants: Number(params.get('infants') || 0),
  });
  const paxCabinSummary = formatPaxCabinMeta(passengerMix, cabinClass, locale);

  const [airports, setAirports] = useState<Airport[]>([]);
  const searchScope: FlightSearchScope =
    requestedScope === 'intl'
      ? 'intl'
      : requestedScope === 'domestic'
        ? 'domestic'
        : airports.some(
              (airport) =>
                (airport.code === origin || airport.code === dest) &&
                airport.isInternational,
            )
          ? 'intl'
          : 'domestic';
  const [results, setResults] = useState<SearchFlightResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNonce, setSearchNonce] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [fStops, setFStops] = useState<'all' | 'direct' | 'one'>('all');
  const [fTime, setFTime] = useState<'all' | 'morning' | 'noon' | 'evening'>(
    'all',
  );
  const [fAirline, setFAirline] = useState('all');
  const [sort, setSort] = useState<'recommended' | 'closest' | 'cheap'>('recommended');
  const [aiState, setAiState] = useState<
    'idle' | 'loading' | 'done' | 'unavailable' | 'error'
  >('idle');
  const [advisory, setAdvisory] = useState<SearchAdvisoryResult | null>(null);
  const [aiVisible, setAiVisible] = useState(true);
  const [selectedOutbound, setSelectedOutbound] = useState<OutboundLeg | null>(null);

  useEffect(() => {
    if (!returnDate) {
      setSelectedOutbound(null);
      sessionStorage.removeItem(ROUNDTRIP_OUTBOUND_KEY);
      return;
    }
    try {
      const raw = sessionStorage.getItem(ROUNDTRIP_OUTBOUND_KEY);
      setSelectedOutbound(raw ? (JSON.parse(raw) as OutboundLeg) : null);
    } catch {
      setSelectedOutbound(null);
    }
  }, [returnDate, origin, dest, date]);

  const isReturnLeg = Boolean(returnDate && selectedOutbound);
  const searchOrigin = isReturnLeg ? dest : origin;
  const searchDest = isReturnLeg ? origin : dest;
  const searchDate = isReturnLeg ? returnDate : date;

  const [club, setClub] = useState<{
    isMember: boolean;
    level: string | null;
  } | null>(null);
  const [lockBusyKey, setLockBusyKey] = useState<string | null>(null);
  const [realLockResult, setRealLockResult] = useState<RealLockResult | null>(
    null,
  );

  useEffect(() => {
    fetchAirports()
      .then(setAirports)
      .catch(() => setAirports([]));
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') {
      setClub(null);
      return;
    }
    fetchClubPoints()
      .then((c) => setClub({ isMember: c.isMember, level: c.level }))
      .catch(() => setClub(null));
  }, [status]);

  useEffect(() => {
    if (!searchOrigin || !searchDest || !searchDate) return;
    let cancelled = false;
    setResults(null);
    setSearchError(null);
    setAiState('idle');
    setAdvisory(null);
    setExpandedId(null);

    const timeout = window.setTimeout(() => {
      if (!cancelled) setResults((prev) => (prev === null ? [] : prev));
    }, 12_000);

    searchFlights(searchOrigin, searchDest, searchDate, cabinClass)
      .then((found) => {
        if (!cancelled) setResults(filterSellableSearchFlights(found));
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setSearchError(copy.searchError);
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [searchOrigin, searchDest, searchDate, cabinClass, copy.searchError, searchNonce]);

  useEffect(
    () => onSearchResultsInvalidate(() => setSearchNonce((n) => n + 1)),
    [],
  );

  const airportMap = useMemo(
    () => new Map(airports.map((a) => [a.code, a])),
    [airports],
  );
  const cityName = (code: string) =>
    airportCityName(code, locale, airportMap.get(code)?.cityFa);
  const cityLabel = (code: string) =>
    airportCityLabel(code, locale, airportMap.get(code)?.cityFa);

  /** Real search API only — never invent demo flights when inventory is empty. */
  const effectiveResults = results;

  const airlines = useMemo(() => {
    const set = new Set<string>();
    for (const r of effectiveResults ?? [])
      set.add(flightAirlineLabel(r.flightNo));
    return Array.from(set).sort();
  }, [effectiveResults]);

  const filteredResults = useMemo(() => {
    let list = [...(effectiveResults ?? [])];
    if (fStops === 'direct') list = list.filter((f) => !f.connection);
    if (fStops === 'one') list = list.filter((f) => Boolean(f.connection));
    if (fTime !== 'all')
      list = list.filter((f) => depHourBucket(f.departureAt) === fTime);
    if (fAirline !== 'all')
      list = list.filter((f) => flightAirlineLabel(f.flightNo) === fAirline);
    return sortFlights(list, sort);
  }, [effectiveResults, fStops, fTime, fAirline, sort]);

  const resultsPager = usePagination(filteredResults);

  const aiPickId = useMemo(() => {
    if (
      !advisory ||
      advisory.recommendation !== 'buy' ||
      filteredResults.length === 0
    )
      return null;
    return filteredResults[0]?.flightInstanceId ?? null;
  }, [advisory, filteredResults]);

  async function onRealLockClick(flightInstanceId: string, cabin: CabinClass) {
    if (status !== 'authenticated') {
      navigate('/signin', { state: { from: `/results?${params.toString()}` } });
      return;
    }
    if (!club?.isMember || !GOLD_TIER_LEVELS.includes(club.level ?? '')) {
      setRealLockResult({ kind: 'not-gold' });
      return;
    }
    const key = `${flightInstanceId}:${cabin}`;
    setLockBusyKey(key);
    try {
      const lock = await createPriceLock(flightInstanceId, cabin);
      setRealLockResult({ kind: 'success', lock });
    } catch (err) {
      setRealLockResult({
        kind: 'error',
        message: err instanceof ApiRequestError ? err.message : ERR[locale],
      });
    } finally {
      setLockBusyKey(null);
    }
  }

  async function askAi() {
    setAiState('loading');
    try {
      const data = await fetchSearchAdvisory(origin, dest, date, cabinClass);
      if (!data.available) {
        setAdvisory(null);
        setAiState('unavailable');
        return;
      }
      setAdvisory(data);
      setAiState('done');
    } catch {
      setAiState('error');
    }
  }

  function applyEditSearch(
    nextOrigin: string,
    nextDest: string,
    nextDate: string,
    nextReturnDate: string | undefined,
    nextMix: PassengerMix,
    nextCabin: CabinClass,
  ) {
    if (nextOrigin === nextDest) return;
    const mix = normalizePassengerMix(nextMix);
    const next = new URLSearchParams(params);
    next.set('origin', nextOrigin);
    next.set('dest', nextDest);
    next.set('date', nextDate);
    next.set('adults', String(mix.adults));
    next.set('children', String(mix.children));
    next.set('infants', String(mix.infants));
    next.set('cabin', nextCabin);
    next.set('scope', searchScope);
    if (nextReturnDate) next.set('returnDate', nextReturnDate);
    else next.delete('returnDate');
    setSelectedOutbound(null);
    sessionStorage.removeItem(ROUNDTRIP_OUTBOUND_KEY);
    setParams(next);
    setEditOpen(false);
  }

  function buildFlightSnapshot(
    r: SearchFlightResult,
    cabin: CabinClass,
  ): FlightSnapshot {
    const cabinOpt = r.cabins.find((x) => x.cabin === cabin);
    return {
      flightInstanceId: r.flightInstanceId,
      flightNo: r.flightNo,
      originCode: r.originCode,
      destCode: r.destCode,
      departureAt: r.departureAt,
      arrivalAt: r.arrivalAt,
      aircraftType: r.aircraftType,
      priceIrr: cabinOpt?.priceIrr ?? '0',
    };
  }

  function proceedToCheckout(
    r: SearchFlightResult,
    c: CabinClass,
    selectedSeats: string[] = [],
  ) {
    const flight = buildFlightSnapshot(r, c);
    const draft: CheckoutDraft = {
      flightInstanceId: flight.flightInstanceId,
      cabin: c,
      selectedSeats,
      flight,
      passengerMix,
      outboundLeg: isReturnLeg ? selectedOutbound ?? undefined : undefined,
    };
    // Contains public itinerary data and passenger counts only; no PII or payment data.
    // codeql[js/clear-text-storage-of-sensitive-data]
    sessionStorage.setItem('blujet_checkout_draft', JSON.stringify(draft));
    if (isReturnLeg) {
      sessionStorage.removeItem(ROUNDTRIP_OUTBOUND_KEY);
    }
    const q = new URLSearchParams({
      flightInstanceId: r.flightInstanceId,
      cabin: c,
      origin: r.originCode,
      dest: r.destCode,
      adults: String(passengerMix.adults),
      children: String(passengerMix.children),
      infants: String(passengerMix.infants),
    });
    const checkoutPath = `/checkout/new?${q.toString()}`;
    navigate(checkoutPath, { state: { cabin: c, flight } });
  }

  function handleBuy(r: SearchFlightResult, c: CabinClass) {
    if (returnDate && !isReturnLeg) {
      const flight = buildFlightSnapshot(r, c);
      const leg: OutboundLeg = {
        flightInstanceId: flight.flightInstanceId,
        cabin: c,
        selectedSeats: [],
        flight,
      };
      setSelectedOutbound(leg);
      // Contains public itinerary data only; no PII or payment data.
      // codeql[js/clear-text-storage-of-sensitive-data]
      sessionStorage.setItem(ROUNDTRIP_OUTBOUND_KEY, JSON.stringify(leg));
      setResults(null);
      setExpandedId(null);
      return;
    }
    proceedToCheckout(r, c);
  }

  function clearFilters() {
    setFStops('all');
    setFTime('all');
    setFAirline('all');
    resultsPager.setPage(1);
  }

  if (!origin || !dest || !date) {
    return (
      <PublicPageShell>
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            padding: '40px 26px',
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: '#0d2640',
              marginBottom: 8,
            }}
          >
            {copy.emptyTitle}
          </h1>
          <p style={{ fontSize: 14, color: '#6b7b94', marginBottom: 24 }}>
            {copy.emptySub}
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              borderRadius: 11,
              background: '#1668c4',
              color: '#fff',
              padding: '11px 24px',
              fontSize: 14,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {copy.goToSearch}
          </button>
        </div>
      </PublicPageShell>
    );
  }

  const dateLabel = formatLocaleDate(`${searchDate}T12:00:00Z`, locale);
  const routeOrigin = isReturnLeg ? dest : origin;
  const routeDest = isReturnLeg ? origin : dest;

  return (
    <PublicPageShell>
      {isMobile && (
        <div
          style={{
            background: '#fff',
            borderBottom: '1px solid #eef1f5',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label={copy.changeSearch}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#f3f5f8',
              border: '1px solid #e6eaf0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0d2640',
              cursor: 'pointer',
              flex: 'none',
            }}
          >
            {locale === 'en' ? '←' : '→'}
          </button>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#16202e' }}>
            {copy.searchResultsLabel}
          </span>
        </div>
      )}

      <div style={{ background: '#fff', borderBottom: '1px solid #e6eaf0' }}>
        <div
          style={{
            maxWidth: 1320,
            margin: '0 auto',
            padding: isMobile ? '14px 16px' : '18px 26px',
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'center',
            justifyContent: 'space-between',
            gap: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? 12 : 16,
            }}
          >
            <div
              style={{
                width: isMobile ? 44 : 52,
                height: isMobile ? 44 : 52,
                borderRadius: 15,
                background: '#eef4fb',
                color: '#1668c4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isMobile ? 18 : 22,
                flex: 'none',
                transform: isRTL ? 'scaleX(-1)' : undefined,
              }}
            >
              ✈
            </div>
            <div style={{ lineHeight: 1.45, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <h2
                  style={{
                    fontSize: isMobile ? 16 : 18,
                    fontWeight: 900,
                    color: '#0d2640',
                    margin: '0 0 6px',
                  }}
                >
                  {isReturnLeg ? copy.selectReturnLabel : copy.selectDepartureLabel}
                </h2>
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      color: '#1668c4',
                      fontSize: 13,
                      fontWeight: 800,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {copy.editShortLabel} ✎
                  </button>
                )}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: '#3b4554',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ color: '#0d2640', fontWeight: 800 }}>
                  {cityLabel(routeOrigin)}
                </span>
                <span style={{ color: '#1668c4' }}>{copy.routeArrow}</span>
                <span style={{ color: '#0d2640', fontWeight: 800 }}>
                  {cityLabel(routeDest)}
                </span>
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: '#cbd6e4',
                  }}
                />
                <span>{dateLabel}</span>
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: '#cbd6e4',
                  }}
                />
                <span
                  style={{ color: '#7a8696' }}
                  data-testid="results-pax-cabin-summary"
                >
                  {paxCabinSummary}
                </span>
              </div>
            </div>
          </div>
          {!isMobile && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                padding: '12px 21px',
                border: '1.5px solid #1668c4',
                color: '#1668c4',
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 800,
                background: '#fff',
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {copy.editSearchLabel} ✎
            </button>
          )}
        </div>
      </div>

      {aiVisible && (
        <ResultsAiRadar
          locale={locale}
          copy={copy}
          aiState={aiState}
          advisory={advisory}
          onAnalyze={() => void askAi()}
          onClose={() => setAiVisible(false)}
        />
      )}

      {!isMobile && (
        <FlightPriceCalendar
          origin={origin}
          dest={dest}
          selectedDate={date}
          locale={locale}
          cabin={cabinClass}
          onSelectDate={(nextDate) => {
            const next = new URLSearchParams(params);
            next.set('date', nextDate);
            setParams(next);
          }}
        />
      )}

      <div
        style={{ maxWidth: 1320, margin: '0 auto', padding: '16px 26px 39px' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 13.5, color: '#5a6678' }}>
            {copy.flightsCount(
              filteredResults.length,
              resultsPager.page,
              resultsPager.totalPages,
            )}
          </span>
          <div
            style={{
              display: 'flex',
              background: '#fff',
              border: '1px solid #eef1f5',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {(
              [
                ['recommended', copy.sortRecommended],
                ['closest', copy.sortClosest],
                ['cheap', copy.sortCheap],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setSort(k);
                  resultsPager.setPage(1);
                }}
                style={{
                  padding: '9px 14px',
                  fontSize: 13,
                  fontWeight: sort === k ? 700 : 600,
                  background: sort === k ? '#1668c4' : '#fff',
                  color: sort === k ? '#fff' : '#5a6678',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  borderRight: k !== 'cheap' ? '1px solid #eef1f5' : undefined,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {!isMobile && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              flexWrap: 'wrap',
              marginBottom: 13,
              background: '#fff',
              border: '1px solid #eef1f5',
              borderRadius: 13,
              padding: '11px 14px',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 800,
                color: '#0d2640',
              }}
            >
              ☰ {copy.filterLabel}
            </span>
            <button
              type="button"
              data-testid="f-stops-direct"
              onClick={() => setFStops(fStops === 'direct' ? 'all' : 'direct')}
              style={{
                padding: '8px 14px',
                borderRadius: 9,
                border:
                  fStops === 'direct'
                    ? '1.5px solid #1668c4'
                    : '1.5px solid #eef1f5',
                background: fStops === 'direct' ? '#eef4fb' : '#fff',
                color: fStops === 'direct' ? '#1668c4' : '#5a6678',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {copy.nonstopLabel}
            </button>
            <span style={{ width: 1, height: 22, background: '#eef1f5' }} />
            <div
              style={{
                display: 'flex',
                background: '#f4f7fb',
                border: '1px solid #eef1f5',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {(
                [
                  ['all', copy.all],
                  ['morning', copy.morning],
                  ['noon', copy.noon],
                  ['evening', copy.evening],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFTime(k)}
                  style={{
                    padding: '8px 13px',
                    fontSize: 13,
                    cursor: 'pointer',
                    background: fTime === k ? '#1668c4' : 'transparent',
                    color: fTime === k ? '#fff' : '#5a6678',
                    fontWeight: fTime === k ? 700 : 600,
                    border: 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <span style={{ width: 1, height: 22, background: '#eef1f5' }} />
            <select
              value={fAirline}
              onChange={(e) => setFAirline(e.target.value)}
              style={{
                height: 38,
                border: '1.5px solid #e6eaf0',
                borderRadius: 10,
                background: '#fff',
                color: '#16202e',
                fontSize: 13,
                fontWeight: 600,
                padding: '0 12px',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <option value="all">{copy.all}</option>
              {airlines.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        )}

        {isMobile && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 14,
            }}
          >
            <span
              data-testid="f-stops-all"
              onClick={() => setFStops('all')}
              style={chipStyle(fStops === 'all')}
            >
              {copy.all}
            </span>
            <span
              data-testid="f-stops-direct"
              onClick={() => setFStops('direct')}
              style={chipStyle(fStops === 'direct')}
            >
              {copy.direct}
            </span>
            <span
              data-testid="f-stops-one"
              onClick={() => setFStops('one')}
              style={chipStyle(fStops === 'one')}
            >
              {copy.oneStop}
            </span>
          </div>
        )}

        {results === null && effectiveResults === null && (
          <p style={{ fontSize: 14, color: '#6b7b94' }}>{copy.searching}</p>
        )}

        {searchError && (
          <div
            data-testid="search-error"
            style={{
              marginBottom: 12,
              borderRadius: 12,
              border: '1px solid #fde3c4',
              background: '#fff7ed',
              padding: 12,
              fontSize: 13,
              fontWeight: 600,
              color: '#9a5b16',
            }}
          >
            {searchError}
          </div>
        )}

        {effectiveResults !== null &&
          effectiveResults.length === 0 &&
          !searchError && (
            <div
              data-testid="empty-results"
              style={{
                background: '#fff',
                border: '1px solid #eef1f5',
                borderRadius: 18,
                padding: '64px 24px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 900,
                  color: '#0d2640',
                  marginBottom: 9,
                }}
              >
                {copy.noResultsTitle}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: '#8a96a6',
                  lineHeight: 2,
                  maxWidth: 380,
                  margin: '0 auto',
                }}
              >
                {copy.noResultsSub}
              </div>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                style={{
                  marginTop: 24,
                  padding: '12px 26px',
                  background: '#1668c4',
                  color: '#fff',
                  borderRadius: 11,
                  fontSize: 13.5,
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {copy.editSearchLabel}
              </button>
            </div>
          )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {resultsPager.pageItems.map((r) => {
            const cabin = primaryCabin(r);
            if (!cabin) return null;
            return (
              <ResultsFlightCard
                key={r.flightInstanceId}
                flight={r}
                locale={locale}
                isMobile={isMobile}
                isRTL={isRTL}
                expanded={expandedId === r.flightInstanceId}
                isAiPick={aiPickId === r.flightInstanceId}
                copy={copy}
                originTz={airportMap.get(r.originCode)?.tz}
                destTz={airportMap.get(r.destCode)?.tz}
                cityName={cityName}
                lockBusyKey={lockBusyKey}
                showGoldLock={Boolean(
                  club?.isMember && GOLD_TIER_LEVELS.includes(club.level ?? ''),
                )}
                passengerMix={passengerMix}
                preferredCabin={cabinClass}
                buyLabel={
                  returnDate && !isReturnLeg
                    ? copy.selectOutboundActionLabel
                    : undefined
                }
                onToggle={() =>
                  setExpandedId((id) =>
                    id === r.flightInstanceId ? null : r.flightInstanceId,
                  )
                }
                onBuy={(c) => handleBuy(r, c)}
                onLock={(c) => void onRealLockClick(r.flightInstanceId, c)}
              />
            );
          })}
        </div>

        {effectiveResults !== null &&
          effectiveResults.length > 0 &&
          filteredResults.length === 0 && (
            <div
              style={{
                background: '#fff',
                border: '1px solid #eef1f5',
                borderRadius: 14,
                padding: '54px 24px',
                textAlign: 'center',
              }}
            >
              <h3
                style={{
                  fontSize: 17.5,
                  fontWeight: 800,
                  color: '#0d2640',
                  margin: '0 0 8px',
                }}
              >
                {copy.noResultsTitle}
              </h3>
              <p
                style={{
                  fontSize: 13.5,
                  color: '#5a6678',
                  lineHeight: 1.9,
                  margin: '0 auto 22px',
                  maxWidth: 380,
                }}
              >
                {copy.noFlightsForFilters}
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={clearFilters}
                  style={{
                    height: 46,
                    padding: '0 22px',
                    borderRadius: 12,
                    background: '#1668c4',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {copy.clearFilters}
                </button>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  style={{
                    height: 46,
                    padding: '0 22px',
                    borderRadius: 12,
                    border: '1.5px solid #e6eaf0',
                    color: '#5a6678',
                    fontSize: 14,
                    fontWeight: 700,
                    background: '#fff',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {copy.changeSearch}
                </button>
              </div>
            </div>
          )}

        <Pagination
          page={resultsPager.page}
          totalPages={resultsPager.totalPages}
          onChange={resultsPager.setPage}
          variant="light"
        />
      </div>

      <ResultsEditSearchModal
        open={editOpen}
        locale={locale}
        copy={copy}
        origin={origin}
        dest={dest}
        date={date}
        returnDate={returnDate}
        passengerMix={passengerMix}
        cabin={cabinClass}
        scope={searchScope}
        onClose={() => setEditOpen(false)}
        onApply={applyEditSearch}
      />


      {realLockResult && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(13,38,64,.55)',
            padding: 20,
          }}
          onClick={() => setRealLockResult(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="real-lock-modal"
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: 18,
              background: '#fff',
              padding: 24,
              textAlign: 'center',
              boxShadow: '0 30px 70px -20px rgba(0,0,0,.5)',
            }}
          >
            {realLockResult.kind === 'not-gold' && (
              <>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 900,
                    color: '#0d2640',
                    marginBottom: 8,
                  }}
                >
                  {copy.smartFareLock}
                </h2>
                <p
                  style={{
                    fontSize: 12,
                    lineHeight: 1.8,
                    color: '#5a6678',
                    marginBottom: 16,
                  }}
                >
                  {copy.fareLockGoldOnly}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => navigate('/club')}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      background: '#1668c4',
                      color: '#fff',
                      padding: '10px 0',
                      fontSize: 12,
                      fontWeight: 800,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {copy.learnAboutClub}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRealLockResult(null)}
                    style={{
                      borderRadius: 10,
                      border: '1px solid #d5e1f0',
                      padding: '10px 18px',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#5a6678',
                      background: '#fff',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {copy.close}
                  </button>
                </div>
              </>
            )}
            {realLockResult.kind === 'success' && (
              <>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 900,
                    color: '#0d2640',
                    marginBottom: 8,
                  }}
                >
                  {copy.yourPriceLocked}
                </h2>
                <p
                  style={{
                    fontSize: 12,
                    lineHeight: 1.8,
                    color: '#5a6678',
                    marginBottom: 8,
                  }}
                >
                  {copy.lockRateUntil(
                    localeMoney(realLockResult.lock.lockedPriceIrr, locale),
                    formatLocaleDateTime(realLockResult.lock.expiresAt, locale),
                  )}
                </p>
                <p style={{ fontSize: 11, color: '#8a96a6', marginBottom: 16 }}>
                  {copy.fee}: {localeMoney(realLockResult.lock.feeIrr, locale)}{' '}
                  {copy.toman}
                </p>
                <button
                  type="button"
                  onClick={() => setRealLockResult(null)}
                  style={{
                    width: '100%',
                    borderRadius: 10,
                    background: '#1668c4',
                    color: '#fff',
                    padding: '10px 0',
                    fontSize: 12,
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {copy.gotIt}
                </button>
              </>
            )}
            {realLockResult.kind === 'error' && (
              <>
                <div style={{ fontSize: 28, marginBottom: 8 }}>⚠</div>
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 900,
                    color: '#0d2640',
                    marginBottom: 8,
                  }}
                >
                  {copy.lockFailedTitle}
                </h2>
                <p
                  role="alert"
                  style={{
                    fontSize: 12,
                    lineHeight: 1.8,
                    color: '#5a6678',
                    marginBottom: 16,
                  }}
                >
                  {realLockResult.message}
                </p>
                <button
                  type="button"
                  onClick={() => setRealLockResult(null)}
                  style={{
                    width: '100%',
                    borderRadius: 10,
                    border: '1px solid #d5e1f0',
                    padding: '10px 0',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#5a6678',
                    background: '#fff',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {copy.close}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </PublicPageShell>
  );
}
