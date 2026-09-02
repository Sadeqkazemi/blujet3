import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import JalaliDatePicker from '../../../components/JalaliDatePicker';
import type { Airport, CabinClass } from '../../../types/public-site';
import type { StoredLocale } from '../../../hooks/useLocale';
import {
  airportCityLabel,
  airportCityName,
  airportMatchesQuery,
  airportName,
} from '../../../lib/airport-cities';
import { formatToman } from '../../../lib/fa-format';
import { useMobileVisualViewport } from '../../../hooks/useMobileVisualViewport';
import { useHorizontalDragScroll } from '../../../hooks/useHorizontalDragScroll';
import { airportsForSearchScope } from '../../../lib/airport-search-scope';
import {
  airportsOutsideSelectedCity,
  airportsShareCity,
} from '../../../lib/airport-route-options';
import {
  DomesticFlightIcon,
  IntlFlightIcon,
  PinIcon,
  PlaneIcon,
  SearchIcon,
  UserIcon,
} from './home-icons';

const TODAY_ISO = new Date().toISOString().slice(0, 10);

type TopTab = 'book' | 'manage' | 'checkin';
type TripType = 'one' | 'round' | 'multi';
type ServiceType = 'domestic' | 'intl';
type Cabin = CabinClass;

export type HomeSearchCopy = {
  tabBook: string;
  tabManage: string;
  tabCheckin: string;
  svcDomestic: string;
  svcIntl: string;
  tripOneWay: string;
  tripRoundTrip: string;
  tripMultiCity: string;
  lblOrigin: string;
  lblDestination: string;
  lblDepartDate: string;
  lblReturnDate: string;
  lblPaxClass: string;
  lblFlightType: string;
  selectPlaceholder: string;
  originPlaceholder: string;
  destPlaceholder: string;
  destNeedOriginPlaceholder: string;
  cityEmptyLabel: string;
  cityListLabel: string;
  btnSearch: string;
  btnConfirm: string;
  lblAdults: string;
  lblAdultsAge: string;
  lblChildren: string;
  lblChildrenAge: string;
  lblInfants: string;
  lblInfantsAge: string;
  lblCabinClass: string;
  cabinEconomy: string;
  cabinBusiness: string;
  manageIntro: string;
  lblBookingCode: string;
  phBookingCode: string;
  lblLastName: string;
  phLastName: string;
  btnViewBooking: string;
  checkinIntro: string;
  lblFlightNo: string;
  phFlightNo: string;
  lblFlightDate: string;
  phFlightDate: string;
  btnViewStatus: string;
  popularRoutesTitle: string;
  popularRoutesSub: string;
  fromPrice: string;
  toman: string;
  airlineBadge: string;
  airlineTitle: string;
  airlineSub: string;
  airlineBtn: string;
  missing: string;
  sameCity: string;
};

type RouteItem = { fromCode: string; toCode: string; tomanPrice: number };

function TripRadio({
  active,
  label,
  onClick,
  isMobile,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  isMobile: boolean;
}) {
  const activeColor = isMobile ? '#fff' : '#16202e';
  const inactiveColor = isMobile ? 'rgba(255,255,255,.68)' : '#5a6678';
  const inactiveBorder = isMobile
    ? '2px solid rgba(255,255,255,.4)'
    : '2px solid #c5cedb';
  return (
    <span
      className={active ? 'home-trip-active' : 'home-trip-inactive'}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        cursor: 'pointer',
        color: active ? activeColor : inactiveColor,
        fontWeight: active ? 700 : 500,
        fontSize: 13,
      }}
    >
      <span
        className="home-trip-ring"
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: active ? '2px solid #1668c4' : inactiveBorder,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {active && (
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#1668c4',
            }}
          />
        )}
      </span>
      {label}
    </span>
  );
}

function AirportCell({
  label,
  value,
  display,
  airports,
  onPick,
  testId,
  fieldStyle,
  isRTL,
  locale,
  isMobile,
  cityListLabel,
  cityEmptyLabel,
  cellPadding = '10px 24px 10px 20px',
  compact = false,
  className,
  disabled = false,
  onDisabledClick,
}: {
  label: string;
  value: string;
  display: string;
  airports: Airport[];
  onPick: (code: string) => void;
  testId: string;
  fieldStyle?: React.CSSProperties;
  isRTL: boolean;
  locale: StoredLocale;
  isMobile: boolean;
  cityListLabel: string;
  cityEmptyLabel: string;
  cellPadding?: string;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
  onDisabledClick?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileViewport = useMobileVisualViewport(open && isMobile);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target as Node) &&
        !sheetRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open || !isMobile) return;

    const scrollY = window.scrollY;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyLeft = document.body.style.left;
    const previousBodyRight = document.body.style.right;
    const previousBodyWidth = document.body.style.width;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.left = previousBodyLeft;
      document.body.style.right = previousBodyRight;
      document.body.style.width = previousBodyWidth;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    };
  }, [isMobile, open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return airports;
    return airports.filter((airport) => airportMatchesQuery(airport, query));
  }, [airports, query]);

  function toggleOpen() {
    if (disabled) {
      onDisabledClick?.();
      return;
    }
    setOpen((v) => !v);
  }

  // Qatar-style bottom sheet: rounded top, dimmed page peeks above, sheet
  // bottom sits on the visual-viewport edge (above the soft keyboard).
  const visibleHeight = mobileViewport?.visibleHeight ?? 0;
  const visibleWidth = mobileViewport?.visibleWidth ?? 0;
  const offsetTop = mobileViewport?.offsetTop ?? 0;
  const offsetLeft = mobileViewport?.offsetLeft ?? 0;
  const compactSheet = Boolean(mobileViewport && visibleHeight > 0 && visibleHeight < 240);
  const sheetTopGap = compactSheet
    ? 0
    : Math.min(64, Math.max(28, Math.round((visibleHeight || 800) * 0.08)));
  const mobilePickerCopy = {
    fa: {
      airports: 'فرودگاه‌ها',
    },
    en: {
      airports: 'Airports',
    },
    ar: {
      airports: 'المطارات',
    },
  }[locale];
  const displayedAirports = filtered;

  const dropStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        left: offsetLeft,
        top: offsetTop + sheetTopGap,
        width: mobileViewport ? visibleWidth : '100%',
        height: mobileViewport
          ? Math.max(0, visibleHeight - sheetTopGap)
          : `calc(100dvh - ${sheetTopGap}px)`,
        maxWidth: '100%',
        borderRadius: compactSheet ? 0 : '22px 22px 0 0',
        padding: compactSheet ? '8px 12px 0' : '8px 0 0',
        zIndex: 1001,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        overscrollBehavior: 'contain',
      }
    : {
        position: 'absolute',
        top: '100%',
        [isRTL ? 'right' : 'left']: 0,
        marginTop: 4,
        width: 280,
        maxWidth: '88vw',
        borderRadius: 14,
        zIndex: 40,
        padding: 13,
      };

  return (
    <div
      ref={rootRef}
      className={className}
      style={{
        flex: compact ? undefined : '1.5 1 165px',
        minWidth: compact ? 0 : 165,
        position: 'relative',
        ...fieldStyle,
      }}
    >
      <div
        data-testid={testId}
        onClick={toggleOpen}
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: compact ? '8px 12px' : cellPadding,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: compact ? 58 : undefined,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: '#9aa4b2',
            fontWeight: 600,
            marginBottom: 3,
          }}
        >
          <PinIcon />
          {label}
        </div>
        <div
          className="home-airport-display"
          style={{
            fontSize: '14.5px',
            fontWeight: 800,
            color: value ? '#16202e' : '#9aa4b2',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {display}
        </div>
      </div>
      {open && (() => {
        const pickerLayer = (
          <>
          <div
            data-testid={isMobile ? `${testId}-mobile-overlay` : undefined}
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: isMobile ? undefined : 0,
              left: isMobile ? (mobileViewport?.offsetLeft ?? 0) : undefined,
              top: isMobile ? (mobileViewport?.offsetTop ?? 0) : undefined,
              width: isMobile ? (mobileViewport?.visibleWidth ?? '100%') : undefined,
              height: isMobile
                ? (mobileViewport?.visibleHeight ?? '100dvh')
                : undefined,
              zIndex: isMobile ? 1000 : 38,
              background: isMobile ? 'rgba(13,38,64,.55)' : undefined,
            }}
          />
          <div
            ref={sheetRef}
            role={isMobile ? 'dialog' : undefined}
            aria-modal={isMobile ? true : undefined}
            aria-label={isMobile ? label : undefined}
            data-testid={isMobile ? `${testId}-mobile-sheet` : undefined}
            data-compact-sheet={isMobile && compactSheet ? 'true' : undefined}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              ...dropStyle,
              background: '#fff',
              border: isMobile ? 'none' : '1px solid #e6eaf0',
              boxShadow: isMobile
                ? '0 -18px 54px -24px rgba(8,25,48,.65)'
                : '0 18px 44px -12px rgba(13,38,102,.30)',
            }}
          >
            {isMobile ? (
              <>
                {!compactSheet && (
                  <div
                    aria-hidden="true"
                    style={{
                      width: 40,
                      height: 4,
                      borderRadius: 999,
                      background: '#cfd5de',
                      margin: '2px auto 14px',
                      flex: 'none',
                    }}
                  />
                )}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: compactSheet ? 0 : '0 16px',
                    marginBottom: compactSheet ? 8 : 12,
                    flex: 'none',
                  }}
                >
                  <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    <input
                      ref={inputRef}
                      data-testid={`${testId}-search`}
                      value={query}
                      onChange={(ev) => setQuery(ev.target.value)}
                      placeholder={label}
                      inputMode="search"
                      enterKeyHint="search"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        height: compactSheet ? 44 : 48,
                        border: 'none',
                        borderBottom: '1px solid #e6e8ec',
                        borderRadius: 0,
                        padding: isRTL ? '0 4px 12px 36px' : '0 36px 12px 4px',
                        fontSize: '16px',
                        fontFamily: 'inherit',
                        outline: 'none',
                        background: 'transparent',
                        color: '#111827',
                      }}
                    />
                    {query.trim().length > 0 && (
                      <button
                        type="button"
                        data-testid={`${testId}-search-clear`}
                        aria-label={isRTL ? 'پاک کردن' : 'Clear'}
                        onClick={() => {
                          setQuery('');
                          inputRef.current?.focus({ preventScroll: true });
                        }}
                        style={{
                          position: 'absolute',
                          top: compactSheet ? 8 : 6,
                          [isRTL ? 'left' : 'right']: 0,
                          width: 28,
                          height: 28,
                          border: 0,
                          borderRadius: 999,
                          background: 'transparent',
                          color: '#6b7280',
                          fontSize: 20,
                          lineHeight: 1,
                          cursor: 'pointer',
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid={`${testId}-mobile-close`}
                    aria-label={isRTL ? 'بستن' : 'Close'}
                    onClick={() => setOpen(false)}
                    style={{
                      flex: 'none',
                      width: 36,
                      height: 36,
                      border: 0,
                      borderRadius: 10,
                      background: 'transparent',
                      color: '#6b7280',
                      fontSize: 26,
                      lineHeight: 1,
                      cursor: 'pointer',
                      marginTop: compactSheet ? 0 : -8,
                    }}
                  >
                    ×
                  </button>
                </div>
                {!compactSheet && (
                  <div
                    data-testid={`${testId}-mobile-tabs`}
                    style={{
                      display: 'flex',
                      gap: 8,
                      padding: '0 16px 12px',
                      overflowX: 'auto',
                      flex: 'none',
                      WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    <div
                      data-testid={`${testId}-tab-airport`}
                      style={{
                        height: 36,
                        padding: '0 16px',
                        border: '1.5px solid #0d2640',
                        borderRadius: 999,
                        background: '#0d2640',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        fontFamily: 'inherit',
                        fontSize: 14,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {mobilePickerCopy.airports}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <input
                ref={inputRef}
                data-testid={`${testId}-search`}
                value={query}
                onChange={(ev) => setQuery(ev.target.value)}
                placeholder={label}
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  height: 42,
                  border: '1.5px solid #e2e7ee',
                  borderRadius: 10,
                  padding: '0 12px',
                  fontSize: '12.5px',
                  fontFamily: 'inherit',
                  outline: 'none',
                  marginBottom: 9,
                  flex: 'none',
                }}
              />
            )}
            {!isMobile && (
              <div
                style={{
                  fontSize: '10.5px',
                  color: '#9aa4b2',
                  fontWeight: 700,
                  margin: '0 4px 6px',
                  flex: 'none',
                }}
              >
                {cityListLabel}
              </div>
            )}
            <div
              style={{
                maxHeight: isMobile ? undefined : 220,
                flex: isMobile ? '1 1 auto' : undefined,
                minHeight: 0,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                padding: isMobile ? '0 16px' : undefined,
                paddingBottom: isMobile
                  ? 'max(8px, env(safe-area-inset-bottom))'
                  : undefined,
                borderTop: isMobile && !compactSheet ? '1px solid #e6e8ec' : undefined,
              }}
            >
              {displayedAirports.map((a) => {
                const city = airportCityName(a.code, locale, a.cityFa);
                const name =
                  airportName(a.code, locale, a.airportNameFa) || cityListLabel;
                return (
                  <div
                    key={a.id}
                    onClick={() => {
                      onPick(a.code);
                      setOpen(false);
                      setQuery('');
                    }}
                    data-testid={`airport-option-${a.code}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: isMobile ? '14px 2px' : '8px 7px',
                      borderRadius: isMobile ? 0 : 9,
                      borderBottom: isMobile ? '1px solid #e8eaee' : undefined,
                      cursor: 'pointer',
                    }}
                  >
                    {!isMobile && (
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
                        <PlaneIcon size={15} />
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: isMobile ? '16px' : '12.5px',
                          fontWeight: isMobile ? 600 : 700,
                          color: '#111827',
                        }}
                      >
                        {city}
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: isMobile ? 13.5 : 10.5,
                          color: isMobile ? '#4b5563' : '#9aa4b2',
                          fontWeight: isMobile ? 600 : undefined,
                        }}
                      >
                        <span dir="ltr">
                          {a.code} - {name}
                        </span>
                      </div>
                    </div>
                    {!isMobile && (
                      <span
                        dir="ltr"
                        style={{
                          borderRadius: 7,
                          background: '#eef4fb',
                          padding: '3px 7px',
                          color: '#1668c4',
                          fontSize: 10.5,
                          fontWeight: 800,
                        }}
                      >
                        {a.code}
                      </span>
                    )}
                  </div>
                );
              })}
              {displayedAirports.length === 0 && (
                <div
                  style={{
                    padding: 15,
                    textAlign: 'center',
                    fontSize: isMobile ? '13.5px' : '11.5px',
                    color: '#9aa4b2',
                  }}
                >
                  {cityEmptyLabel}
                </div>
              )}
            </div>
          </div>
          </>
        );
        return isMobile ? createPortal(pickerLayer, document.body) : pickerLayer;
      })()}
    </div>
  );
}

export default function HomeSearchCard({
  locale,
  isMobile,
  isRTL,
  copy: t,
  airports,
  availableCabins,
  cityName,
  popularRoutes,
}: {
  locale: StoredLocale;
  isMobile: boolean;
  isRTL: boolean;
  copy: HomeSearchCopy;
  airports: Airport[];
  availableCabins: CabinClass[];
  cityName: (code: string, cityFa?: string) => string;
  popularRoutes: RouteItem[];
}) {
  const navigate = useNavigate();
  const routesScrollRef = useHorizontalDragScroll<HTMLDivElement>(isMobile);
  const [topTab, setTopTab] = useState<TopTab>('book');
  const [service, setService] = useState<ServiceType>('domestic');
  const [tripType, setTripType] = useState<TripType>('one');
  const [origin, setOrigin] = useState('');
  const [dest, setDest] = useState('');
  const [dateIso, setDateIso] = useState<string | null>(null);
  const [returnIso, setReturnIso] = useState<string | null>(null);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [cabin, setCabin] = useState<Cabin>('ECONOMY');
  const [paxOpen, setPaxOpen] = useState(false);
  const [classBoxOpen, setClassBoxOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pnr, setPnr] = useState('');
  const [lastName, setLastName] = useState('');
  const [flightNo, setFlightNo] = useState('');
  const [statusDateIso, setStatusDateIso] = useState<string | null>(null);

  const showReturn = tripType === 'round' || isMobile;
  const returnInteractive = tripType === 'round';
  const panelBg = isMobile ? 'linear-gradient(135deg,#0d2640,#16406e)' : '#fff';
  const svcTrackBg = isMobile ? 'rgba(255,255,255,.14)' : '#eef1f5';
  const fieldCardExtra: React.CSSProperties = isMobile
    ? {
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 8px 20px -14px rgba(0,0,0,.4)',
      }
    : {};
  const fieldBoxBg = isMobile ? '#fff' : 'transparent';
  const auxFieldBoxStyle: React.CSSProperties = {
    flex: 1,
    background: fieldBoxBg,
    borderRadius: 12,
    padding: '13px 15px',
    boxShadow: '0 8px 20px -12px rgba(0,0,0,.3)',
  };
  const auxFieldLabelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#9aa4b2',
    fontWeight: 600,
    marginBottom: 3,
  };
  const searchBtnRadius = isMobile
    ? '13px'
    : isRTL
      ? '13px 0 0 13px'
      : '0 13px 13px 0';

  const cabinLabelFor = (value: Cabin) =>
    value === 'ECONOMY'
      ? t.cabinEconomy
      : value === 'BUSINESS'
        ? t.cabinBusiness
        : value === 'COMFORT'
          ? locale === 'en' ? 'Comfort' : locale === 'ar' ? 'راحة' : 'کامفورت'
          : locale === 'en' ? 'First Class' : locale === 'ar' ? 'الدرجة الأولى' : 'فرست کلاس';
  const cabinChoices = availableCabins.length > 0 ? availableCabins : ['ECONOMY' as Cabin];
  const cabinLabel = cabinLabelFor(cabin);

  useEffect(() => {
    if (availableCabins.length > 0 && !availableCabins.includes(cabin)) {
      setCabin(availableCabins[0]!);
    }
  }, [availableCabins, cabin]);
  const paxParts = [
    `${formatToman(adults, locale)} ${t.lblAdults}`,
    ...(children ? [`${formatToman(children, locale)} ${t.lblChildren}`] : []),
    ...(infants ? [`${formatToman(infants, locale)} ${t.lblInfants}`] : []),
  ];
  const paxSummary = `${paxParts.join('، ')}، ${cabinLabel}`;

  const airportOptions = useMemo(
    () => airportsForSearchScope(airports, service),
    [airports, service],
  );

  function changeService(next: ServiceType) {
    setService(next);
    const allowed = airportsForSearchScope(airports, next);
    if (origin && !allowed.some((airport) => airport.code === origin)) setOrigin('');
    if (dest && !allowed.some((airport) => airport.code === dest)) setDest('');
    setError(null);
  }

  function originDisplay() {
    if (!origin) return t.originPlaceholder;
    const ap = airportOptions.find((a) => a.code === origin);
    return airportCityLabel(origin, locale, cityName(origin, ap?.cityFa));
  }

  function destDisplay() {
    if (!dest) return t.destPlaceholder;
    const ap = airportOptions.find((a) => a.code === dest);
    return airportCityLabel(dest, locale, cityName(dest, ap?.cityFa));
  }

  function onSearch() {
    if (!origin || !dest || !dateIso) {
      setError(t.missing);
      return;
    }
    if (airportsShareCity(airportOptions, origin, dest)) {
      setError(t.sameCity);
      return;
    }
    if (infants > adults) {
      setError(
        locale === 'en'
          ? 'Each adult can accompany only one lap infant.'
          : locale === 'ar'
            ? 'يمكن لكل بالغ مرافقة رضيع واحد فقط دون مقعد.'
            : 'هر بزرگسال فقط می‌تواند یک نوزاد بدون صندلی همراه داشته باشد.',
      );
      return;
    }
    setError(null);
    const query = new URLSearchParams({
      origin,
      dest,
      date: dateIso.slice(0, 10),
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      cabin,
      scope: service,
    });
    if (tripType === 'round' && returnIso) {
      query.set('returnDate', returnIso.slice(0, 10));
    }
    navigate(`/results?${query.toString()}`);
  }

  const tabs: { id: TopTab; label: string }[] = [
    { id: 'book', label: t.tabBook },
    { id: 'manage', label: t.tabManage },
    { id: 'checkin', label: t.tabCheckin },
  ];

  return (
    <div
      style={{
        maxWidth: 1180,
        margin: '0 auto',
        padding: isMobile ? '0 26px 18px' : '0 26px 26px',
        position: 'relative',
      }}
    >
      <style>{`
        @media (max-width: 767px) {
          #search-card { margin-top: -46px !important; }
          #search-card .home-search-panel {
            background: linear-gradient(135deg, #0d2640, #16406e) !important;
          }
          #search-card .home-search-fields {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 10px !important;
            border: none !important;
            background: transparent !important;
            align-items: start !important;
          }
          #search-card .home-field-card {
            background: #fff !important;
            border-radius: 12px !important;
            box-shadow: 0 8px 20px -14px rgba(0, 0, 0, 0.4) !important;
            min-width: 0 !important;
            flex: none !important;
          }
          #search-card .home-origin { grid-column: 1; grid-row: 1; }
          #search-card .home-dest { grid-column: 2; grid-row: 1; }
          #search-card .home-swap {
            grid-area: 1 / 1 / 2 / -1;
            justify-self: center;
            align-self: center;
            margin: 6px auto;
            z-index: 3;
          }
          #search-card .home-date-dep { grid-column: 1; }
          #search-card .home-date-ret { grid-column: 2; }
          #search-card .home-pax { grid-column: 1; }
          #search-card .home-class { grid-column: 2; }
          #search-card .home-submit {
            grid-column: 1 / -1;
            border-radius: 13px !important;
            width: 100%;
          }
          #search-card .home-svc-track { background: rgba(255, 255, 255, 0.14) !important; }
          #search-card .home-svc-btn.is-active {
            background: #fff !important;
            color: #1668c4 !important;
            box-shadow: 0 2px 6px rgba(13, 38, 102, 0.12) !important;
          }
          #search-card .home-svc-btn:not(.is-active) {
            background: transparent !important;
            color: #fff !important;
          }
          #search-card .home-svc-btn.is-active .home-svc-icon { color: #1668c4 !important; }
          #search-card .home-svc-btn:not(.is-active) .home-svc-icon { color: #fff !important; }
          #search-card .home-trip-active { color: #fff !important; }
          #search-card .home-trip-inactive { color: rgba(255, 255, 255, 0.68) !important; }
          #search-card .home-trip-inactive .home-trip-ring { border-color: rgba(255, 255, 255, 0.4) !important; }
          #search-card .home-panel-muted { color: rgba(255, 255, 255, 0.75) !important; }
        }
        @media (min-width: 768px) {
          #search-card { margin-top: -72px !important; }
        }
      `}</style>
      <div
        id="search-card"
        style={{
          background: '#fff',
          borderRadius: 18,
          boxShadow: '0 34px 74px -26px rgba(13,38,102,.45)',
          border: '1px solid #eef1f5',
          marginTop: isMobile ? -46 : -72,
          position: 'relative',
          zIndex: 30,
          overflow: 'visible',
        }}
      >
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #eef1f5',
            borderRadius: '18px 18px 0 0',
            overflow: 'hidden',
          }}
        >
          {tabs.map((tab) => {
            const active = topTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTopTab(tab.id)}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '15px 6px 12px',
                  fontSize: 13,
                  fontWeight: active ? 800 : 600,
                  cursor: 'pointer',
                  color: active ? '#0d2640' : '#8a96a6',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active
                    ? '3px solid #1668c4'
                    : '3px solid transparent',
                  fontFamily: 'inherit',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          className="home-search-panel"
          style={{
            padding: 16,
            background: panelBg,
            borderRadius: '0 0 17px 17px',
          }}
        >
          {topTab === 'book' && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 18,
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <div
                  className="home-svc-track"
                  style={{
                    display: 'inline-flex',
                    background: svcTrackBg,
                    borderRadius: 11,
                    padding: 3,
                  }}
                >
                  {(['domestic', 'intl'] as ServiceType[]).map((svc) => {
                    const active = service === svc;
                    return (
                      <button
                        key={svc}
                        type="button"
                        className={`home-svc-btn${active ? ' is-active' : ''}`}
                        onClick={() => changeService(svc)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 13px',
                          borderRadius: 8,
                          fontSize: '12.5px',
                          cursor: 'pointer',
                          border: 'none',
                          fontFamily: 'inherit',
                          color: active
                            ? '#1668c4'
                            : isMobile
                              ? '#fff'
                              : '#5a6678',
                          fontWeight: active ? 700 : 500,
                          background: active ? '#fff' : 'transparent',
                          boxShadow: active
                            ? '0 2px 6px rgba(13,38,102,.12)'
                            : 'none',
                        }}
                      >
                        <span
                          className="home-svc-icon"
                          style={{
                            display: 'flex',
                            color: active
                              ? '#1668c4'
                              : isMobile
                                ? '#fff'
                                : '#5a6678',
                          }}
                        >
                          {svc === 'domestic' ? (
                            <DomesticFlightIcon size={18} />
                          ) : (
                            <IntlFlightIcon size={18} />
                          )}
                        </span>
                        {svc === 'domestic' ? t.svcDomestic : t.svcIntl}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: isMobile ? 14 : 25,
                  marginBottom: 20,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <TripRadio
                  active={tripType === 'one'}
                  label={t.tripOneWay}
                  onClick={() => setTripType('one')}
                  isMobile={isMobile}
                />
                <TripRadio
                  active={tripType === 'round'}
                  label={t.tripRoundTrip}
                  onClick={() => setTripType('round')}
                  isMobile={isMobile}
                />
                <TripRadio
                  active={tripType === 'multi'}
                  label={t.tripMultiCity}
                  onClick={() => setTripType('multi')}
                  isMobile={isMobile}
                />
              </div>

              {error && (
                <p
                  style={{
                    marginBottom: 12,
                    borderRadius: 10,
                    background: '#fef2f2',
                    padding: 10,
                    fontSize: 12,
                    color: '#e5484d',
                  }}
                >
                  {error}
                </p>
              )}

              <div
                className="home-search-fields"
                style={{
                  display: isMobile ? 'grid' : 'flex',
                  gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'none',
                  gap: isMobile ? 10 : 0,
                  alignItems: isMobile ? 'start' : 'stretch',
                  position: 'relative',
                  border: isMobile ? 'none' : '1.5px solid #e3e9f1',
                  borderRadius: 14,
                  background: isMobile ? 'transparent' : '#fff',
                }}
              >
                <AirportCell
                  label={t.lblOrigin}
                  value={origin}
                  display={originDisplay()}
                  airports={airportsOutsideSelectedCity(airportOptions, dest)}
                  onPick={(code) => {
                    setOrigin(code);
                    if (airportsShareCity(airportOptions, code, dest)) setDest('');
                  }}
                  testId="home-origin"
                  fieldStyle={{
                    gridColumn: isMobile ? '1' : 'auto',
                    gridRow: isMobile ? '1' : 'auto',
                    ...fieldCardExtra,
                  }}
                  className="home-origin home-field-card"
                  isRTL={isRTL}
                  locale={locale}
                  isMobile={isMobile}
                  cityListLabel={t.cityListLabel}
                  cityEmptyLabel={t.cityEmptyLabel}
                  compact={isMobile}
                />

                <div
                  className="home-swap"
                  onClick={() => {
                    if (!origin || !dest) {
                      setError(t.destNeedOriginPlaceholder);
                      return;
                    }
                    setOrigin(dest);
                    setDest(origin);
                    setError(null);
                  }}
                  style={{
                    alignSelf: 'center',
                    justifySelf: 'center',
                    gridArea: isMobile ? '1 / 1 / 2 / -1' : undefined,
                    gridColumn: isMobile ? undefined : 'auto',
                    width: 40,
                    height: 40,
                    flex: 'none',
                    borderRadius: '50%',
                    background: '#fff',
                    border: '1.5px solid #e3e9f1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1668c4',
                    fontSize: '15.5px',
                    cursor: 'pointer',
                    zIndex: 3,
                    margin: isMobile ? '6px auto' : '0 -20px',
                    boxShadow: '0 3px 10px rgba(13,38,102,.12)',
                  }}
                >
                  ⇄
                </div>

                <AirportCell
                  label={t.lblDestination}
                  value={dest}
                  display={destDisplay()}
                  airports={airportsOutsideSelectedCity(airportOptions, origin)}
                  onPick={(code) => {
                    setDest(code);
                    if (airportsShareCity(airportOptions, origin, code)) setOrigin('');
                  }}
                  testId="home-dest"
                  disabled={!origin}
                  onDisabledClick={() => setError(t.destNeedOriginPlaceholder)}
                  fieldStyle={{
                    gridColumn: isMobile ? '2' : 'auto',
                    gridRow: isMobile ? '1' : 'auto',
                    borderRight: isMobile ? 'none' : '1px solid #eef1f5',
                    ...fieldCardExtra,
                  }}
                  className="home-dest home-field-card"
                  isRTL={isRTL}
                  locale={locale}
                  isMobile={isMobile}
                  cityListLabel={t.cityListLabel}
                  cityEmptyLabel={t.cityEmptyLabel}
                  cellPadding="10px 24px 10px 32px"
                  compact={isMobile}
                />

                <div
                  className="home-date-dep home-field-card"
                  style={{
                    flex: '1.1 1 120px',
                    minWidth: isMobile ? 0 : 120,
                    borderRight: isMobile ? 'none' : '1px solid #eef1f5',
                    gridColumn: isMobile ? '1' : 'auto',
                    ...fieldCardExtra,
                  }}
                >
                  <JalaliDatePicker
                    locale={locale}
                    label={t.lblDepartDate}
                    value={dateIso}
                    onChange={setDateIso}
                    minDate={TODAY_ISO}
                    testId="home-date"
                    placeholder={t.selectPlaceholder}
                    subLabel={dateIso ? undefined : t.lblDepartDate}
                    isRTL={isRTL}
                    granularNavigation={false}
                    rtlForwardArrow={false}
                    priceCalendar={
                      isMobile && origin && dest && origin !== dest
                        ? { origin, dest, locale }
                        : undefined
                    }
                  />
                </div>

                {showReturn && (
                  <div
                    className="home-date-ret home-field-card"
                    style={{
                      flex: '1.1 1 120px',
                      minWidth: isMobile ? 0 : 120,
                      borderRight: isMobile ? 'none' : '1px solid #eef1f5',
                      gridColumn: isMobile ? '2' : 'auto',
                      opacity: returnInteractive ? 1 : 0.45,
                      pointerEvents: returnInteractive ? 'auto' : 'none',
                      ...fieldCardExtra,
                    }}
                  >
                    <JalaliDatePicker
                      locale={locale}
                      label={t.lblReturnDate}
                      value={returnIso}
                      onChange={setReturnIso}
                      minDate={dateIso ?? TODAY_ISO}
                      testId="home-return-date"
                      placeholder={t.selectPlaceholder}
                      subLabel={returnIso ? undefined : t.lblReturnDate}
                      isRTL={isRTL}
                      granularNavigation={false}
                      rtlForwardArrow={false}
                    />
                  </div>
                )}

                <div
                  className="home-pax home-field-card"
                  style={{
                    flex: '1.2 1 150px',
                    minWidth: isMobile ? 0 : 150,
                    position: 'relative',
                    borderRight: isMobile ? 'none' : '1px solid #eef1f5',
                    gridColumn: isMobile ? '1' : 'auto',
                    ...fieldCardExtra,
                  }}
                >
                  <div
                    onClick={() => setPaxOpen((v) => !v)}
                    style={{
                      cursor: 'pointer',
                      padding: '5px 13px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      height: '100%',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11,
                        color: '#9aa4b2',
                        fontWeight: 600,
                        marginBottom: 3,
                      }}
                    >
                      <UserIcon />
                      {t.lblPaxClass}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#16202e',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {paxSummary}
                      <span style={{ color: '#9aa4b2', fontSize: 10 }}>▾</span>
                    </div>
                  </div>
                  {paxOpen && (
                    <>
                      <div
                        onClick={() => setPaxOpen(false)}
                        style={{ position: 'fixed', inset: 0, zIndex: 38 }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: 74,
                          [isRTL ? 'right' : 'left']: 0,
                          width: 312,
                          maxWidth: '88vw',
                          background: '#fff',
                          border: '1px solid #e6eaf0',
                          borderRadius: 14,
                          boxShadow: '0 18px 44px -12px rgba(13,38,102,.30)',
                          padding: '5px 15px 15px',
                          zIndex: 40,
                        }}
                      >
                        {[
                          {
                            label: t.lblAdults,
                            sub: t.lblAdultsAge,
                            val: adults,
                            dec: () => setAdults((n) => Math.max(1, n - 1)),
                            inc: () => setAdults((n) => n + 1),
                          },
                          {
                            label: t.lblChildren,
                            sub: t.lblChildrenAge,
                            val: children,
                            dec: () => setChildren((n) => Math.max(0, n - 1)),
                            inc: () => setChildren((n) => n + 1),
                          },
                          {
                            label: t.lblInfants,
                            sub: t.lblInfantsAge,
                            val: infants,
                            dec: () => setInfants((n) => Math.max(0, n - 1)),
                            inc: () => setInfants((n) => n + 1),
                          },
                        ].map((row, i) => (
                          <div
                            key={row.label}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '11px 0',
                              borderBottom:
                                i < 2 ? '1px solid #f2f4f7' : undefined,
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: '12.5px',
                                  fontWeight: 600,
                                  color: '#16202e',
                                }}
                              >
                                {row.label}
                              </div>
                              <div
                                style={{ fontSize: '10.5px', color: '#9aa4b2' }}
                              >
                                {row.sub}
                              </div>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 11,
                              }}
                            >
                              <span
                                onClick={row.dec}
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  border: '1.5px solid #d5dde7',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#1668c4',
                                  fontSize: 18,
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                }}
                              >
                                −
                              </span>
                              <span
                                style={{
                                  width: 22,
                                  textAlign: 'center',
                                  fontWeight: 700,
                                  fontSize: '13.5px',
                                }}
                              >
                                {formatToman(row.val, locale)}
                              </span>
                              <span
                                onClick={row.inc}
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  border: '1.5px solid #d5dde7',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#1668c4',
                                  fontSize: 16,
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                }}
                              >
                                +
                              </span>
                            </div>
                          </div>
                        ))}
                        <div
                          style={{
                            borderTop: '1px solid #eef1f5',
                            marginTop: 6,
                            paddingTop: 11,
                          }}
                        >
                          <div
                            style={{
                              fontSize: '11.5px',
                              color: '#8a96a6',
                              fontWeight: 600,
                              marginBottom: 10,
                            }}
                          >
                            {t.lblCabinClass}
                          </div>
                          <div style={{ display: 'flex', gap: 7 }}>
                            {cabinChoices.map((c) => (
                              <span
                                key={c}
                                data-testid={`home-cabin-${c}`}
                                onClick={() => setCabin(c)}
                                style={{
                                  flex: 1,
                                  textAlign: 'center',
                                  padding: '7px 0',
                                  borderRadius: 9,
                                  border:
                                    cabin === c
                                      ? '1.5px solid #1668c4'
                                      : '1.5px solid #e2e7ee',
                                  background: cabin === c ? '#eef4fb' : '#fff',
                                  color: cabin === c ? '#1668c4' : '#5a6678',
                                  fontSize: '11.5px',
                                  fontWeight: cabin === c ? 700 : 500,
                                  cursor: 'pointer',
                                }}
                              >
                                {cabinLabelFor(c)}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div
                          onClick={() => setPaxOpen(false)}
                          style={{
                            marginTop: 16,
                            height: 44,
                            borderRadius: 10,
                            background: '#1668c4',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '12.5px',
                            cursor: 'pointer',
                          }}
                        >
                          {t.btnConfirm}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {isMobile && (
                  <div
                    className="home-class home-field-card"
                    style={{
                      flex: '1.2 1 150px',
                      minWidth: 0,
                      position: 'relative',
                      gridColumn: '2',
                      ...fieldCardExtra,
                    }}
                  >
                    <div
                      onClick={() => setClassBoxOpen((v) => !v)}
                      style={{
                        cursor: 'pointer',
                        padding: '5px 13px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        height: '100%',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11,
                          color: '#9aa4b2',
                          fontWeight: 600,
                          marginBottom: 3,
                        }}
                      >
                        <PlaneIcon size={14} />
                        {t.lblFlightType}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 13,
                          fontWeight: 700,
                          color: '#16202e',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cabinLabel}
                        <span style={{ color: '#9aa4b2', fontSize: 10 }}>
                          ▾
                        </span>
                      </div>
                    </div>
                    {classBoxOpen && (
                      <>
                        <div
                          onClick={() => setClassBoxOpen(false)}
                          style={{ position: 'fixed', inset: 0, zIndex: 38 }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: 74,
                            [isRTL ? 'right' : 'left']: 0,
                            width: 190,
                            maxWidth: '80vw',
                            background: '#fff',
                            border: '1px solid #e6eaf0',
                            borderRadius: 14,
                            boxShadow: '0 18px 44px -12px rgba(13,38,102,.30)',
                            padding: 10,
                            zIndex: 40,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                          }}
                        >
                          {cabinChoices.map((c) => (
                            <span
                              key={c}
                              data-testid={`home-cabin-${c}`}
                              onClick={() => {
                                setCabin(c);
                                setClassBoxOpen(false);
                              }}
                              style={{
                                padding: '9px 10px',
                                borderRadius: 9,
                                border:
                                  cabin === c
                                    ? '1.5px solid #1668c4'
                                    : '1.5px solid #e2e7ee',
                                background: cabin === c ? '#eef4fb' : '#fff',
                                color: cabin === c ? '#1668c4' : '#5a6678',
                                fontSize: '12.5px',
                                fontWeight: cabin === c ? 700 : 500,
                                cursor: 'pointer',
                              }}
                            >
                              {cabinLabelFor(c)}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  className="home-submit"
                  data-testid="home-search-submit"
                  onClick={onSearch}
                  style={{
                    flex: 'none',
                    alignSelf: 'stretch',
                    gridColumn: isMobile ? '1 / -1' : 'auto',
                    minHeight: 48,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '0 21px',
                    background: '#1668c4',
                    color: '#fff',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    borderRadius: searchBtnRadius,
                    justifyContent: 'center',
                    border: 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  <SearchIcon />
                  {t.btnSearch}
                </button>
              </div>

              {!isMobile && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    marginTop: 18,
                  }}
                >
                  <span
                    style={{
                      fontSize: '11.5px',
                      color: '#5a6678',
                      fontWeight: 600,
                    }}
                  >
                    {t.lblFlightType}
                  </span>
                  <div
                    style={{
                      display: 'inline-flex',
                      background: '#eef1f5',
                      borderRadius: 10,
                      padding: 3,
                    }}
                  >
                    {cabinChoices.map((c) => (
                      <span
                        key={c}
                        data-testid={`home-cabin-${c}`}
                        onClick={() => setCabin(c)}
                        style={{
                          padding: '7px 17px',
                          borderRadius: 8,
                          fontSize: '11.5px',
                          fontWeight: cabin === c ? 700 : 500,
                          color: cabin === c ? '#1668c4' : '#5a6678',
                          background: cabin === c ? '#fff' : 'transparent',
                          boxShadow:
                            cabin === c
                              ? '0 2px 6px rgba(13,38,102,.12)'
                              : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {cabinLabelFor(c)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {topTab === 'manage' && (
            <div style={{ padding: '6px 2px 4px' }}>
              <div
                className="home-panel-muted"
                style={{
                  fontSize: '12.5px',
                  color: isMobile ? '#cfe0f5' : '#5a6678',
                  marginBottom: 16,
                  lineHeight: 1.9,
                }}
              >
                {t.manageIntro}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: 11,
                }}
              >
                <div style={auxFieldBoxStyle}>
                  <div style={auxFieldLabelStyle}>{t.lblBookingCode}</div>
                  <input
                    value={pnr}
                    onChange={(ev) => setPnr(ev.target.value)}
                    placeholder={t.phBookingCode}
                    dir="ltr"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      border: 'none',
                      outline: 'none',
                      fontFamily: 'inherit',
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#16202e',
                      background: 'transparent',
                      textAlign: isRTL ? 'right' : 'left',
                    }}
                  />
                </div>
                <div style={auxFieldBoxStyle}>
                  <div style={auxFieldLabelStyle}>{t.lblLastName}</div>
                  <input
                    value={lastName}
                    onChange={(ev) => setLastName(ev.target.value)}
                    placeholder={t.phLastName}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      border: 'none',
                      outline: 'none',
                      fontFamily: 'inherit',
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#16202e',
                      background: 'transparent',
                    }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const q = new URLSearchParams();
                  if (pnr.trim()) q.set('pnr', pnr.trim());
                  if (lastName.trim()) q.set('lastName', lastName.trim());
                  const qs = q.toString();
                  navigate(`/manage-booking${qs ? `?${qs}` : ''}`);
                }}
                style={{
                  marginTop: 14,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 48,
                  borderRadius: 12,
                  background: '#1668c4',
                  color: '#fff',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t.btnViewBooking}
              </button>
            </div>
          )}

          {topTab === 'checkin' && (
            <div style={{ padding: '6px 2px 4px' }}>
              <div
                className="home-panel-muted"
                style={{
                  fontSize: '12.5px',
                  color: isMobile ? '#cfe0f5' : '#5a6678',
                  marginBottom: 16,
                  lineHeight: 1.9,
                }}
              >
                {t.checkinIntro}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: 11,
                }}
              >
                <div style={auxFieldBoxStyle}>
                  <div style={auxFieldLabelStyle}>{t.lblFlightNo}</div>
                  <input
                    value={flightNo}
                    onChange={(ev) => setFlightNo(ev.target.value)}
                    placeholder={t.phFlightNo}
                    dir="ltr"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      border: 'none',
                      outline: 'none',
                      fontFamily: 'inherit',
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#16202e',
                      background: 'transparent',
                      textAlign: isRTL ? 'right' : 'left',
                    }}
                  />
                </div>
                <div style={auxFieldBoxStyle}>
                  <div style={auxFieldLabelStyle}>{t.lblFlightDate}</div>
                  <JalaliDatePicker
                    locale={locale}
                    label=""
                    value={statusDateIso}
                    onChange={setStatusDateIso}
                    testId="home-status-date"
                    placeholder={t.phFlightDate}
                    isRTL={isRTL}
                    embedded
                    granularNavigation={false}
                    rtlForwardArrow={false}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const q = new URLSearchParams();
                  if (flightNo.trim()) q.set('flightNo', flightNo.trim());
                  if (statusDateIso) q.set('date', statusDateIso.slice(0, 10));
                  const qs = q.toString();
                  navigate(`/flight-status${qs ? `?${qs}` : ''}`);
                }}
                style={{
                  marginTop: 14,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 48,
                  borderRadius: 12,
                  background: '#1668c4',
                  color: '#fff',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t.btnViewStatus}
              </button>
            </div>
          )}
        </div>
      </div>

      {!isMobile && (
        <div style={{ marginTop: 36 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              marginBottom: 15,
            }}
          >
            <span
              style={{
                fontSize: '14.5px',
                color: '#0d2640',
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              {t.popularRoutesTitle}
            </span>
            <span style={{ fontSize: '11.5px', color: '#5a6678' }}>
              {t.popularRoutesSub}
            </span>
          </div>
          <div
            ref={routesScrollRef}
            data-testid="home-popular-routes"
            className={isMobile ? 'hscroll' : undefined}
            style={{
              display: isMobile ? 'flex' : 'grid',
              gridTemplateColumns: isMobile ? undefined : 'repeat(5,1fr)',
              gap: 10,
              overflowX: isMobile ? 'auto' : 'visible',
              scrollSnapType: isMobile ? 'x mandatory' : undefined,
              paddingBottom: isMobile ? 4 : 0,
              WebkitOverflowScrolling: isMobile ? 'touch' : undefined,
              width: '100%',
              maxWidth: '100%',
              minWidth: 0,
              flexWrap: isMobile ? 'nowrap' : undefined,
            }}
          >
            {popularRoutes.map((r) => (
              <button
                type="button"
                key={`${r.fromCode}-${r.toCode}`}
                data-testid={`popular-route-${r.toCode}`}
                onClick={() =>
                  navigate(
                    `/results?origin=${r.fromCode}&dest=${r.toCode}&date=${TODAY_ISO}`,
                  )
                }
                style={{
                  textAlign: isRTL ? 'right' : 'left',
                  background: '#fff',
                  border: '1px solid #e8eef6',
                  borderRadius: 12,
                  padding: '16px 11px',
                  boxShadow: '0 12px 28px -20px rgba(13,38,102,.45)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  flex: isMobile ? 'none' : undefined,
                  width: isMobile ? 'calc((100% - 10px) / 2)' : undefined,
                  minWidth: isMobile ? 'calc((100% - 10px) / 2)' : undefined,
                  scrollSnapAlign: isMobile ? 'start' : undefined,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 7,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: '#16202e',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cityName(r.fromCode)}{' '}
                    <span style={{ color: '#b9c2cf', fontWeight: 600 }}>
                      {locale === 'en' ? '→' : '←'}
                    </span>{' '}
                    {cityName(r.toCode)}
                  </span>
                  <PlaneIcon />
                </div>
                <div style={{ fontSize: 11, color: '#9aa4b2' }}>
                  {t.fromPrice}{' '}
                  <span
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 800,
                      color: '#1668c4',
                    }}
                  >
                    {formatToman(r.tomanPrice, locale)}
                  </span>{' '}
                  {t.toman}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isMobile && (
        <div
          style={{
            marginTop: 30,
            position: 'relative',
            borderRadius: 18,
            overflow: 'hidden',
            minHeight: 150,
            boxShadow: '0 14px 34px -22px rgba(13,38,102,.4)',
            background:
              'linear-gradient(100deg,#0d2666 0%,#1668c4 60%,#3f8ede 100%)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(100deg,rgba(13,38,102,.92) 10%,rgba(22,104,196,.55) 60%,rgba(22,104,196,.15) 100%)',
            }}
          />
          <div style={{ position: 'relative', zIndex: 2, padding: 20 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#ffffff22',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: '10.5px',
                fontWeight: 700,
                marginBottom: 11,
              }}
            >
              {t.airlineBadge}
            </div>
            <div
              style={{
                fontSize: '16.5px',
                fontWeight: 800,
                color: '#fff',
                marginBottom: 7,
                lineHeight: 1.5,
              }}
            >
              {t.airlineTitle}
            </div>
            <p
              style={{
                fontSize: 12,
                color: '#cfe0f5',
                margin: '0 0 15px',
                lineHeight: 1.8,
                maxWidth: 280,
              }}
            >
              {t.airlineSub}
            </p>
            <button
              type="button"
              onClick={() => navigate('/destinations')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#fff',
                color: '#0d2640',
                padding: '9px 18px',
                borderRadius: 11,
                fontSize: '12.5px',
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t.airlineBtn} <span>{locale === 'en' ? '→' : '←'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
