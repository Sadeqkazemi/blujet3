import type { StoredLocale } from '../../../hooks/useLocale';
import { localeDigits } from '../../../lib/locale-format';
import type { CabinClass, SeatMapCell } from '../../../types/public-site';
import {
  buildMd80Seats,
  md80ColsForRow,
  md80IsExitRow,
  md80LeftAmenity,
  md80Rows,
  md80SectionForRow,
  MD80_EXCLUDED,
  MD80_WING_ROW_END,
  MD80_WING_ROW_START,
} from './md80-seat-layout';

const SECTION_LABEL: Record<
  StoredLocale,
  Record<'FIRST' | 'BUSINESS' | 'ECONOMY' | 'EXIT', string>
> = {
  fa: {
    FIRST: 'فرست کلاس',
    BUSINESS: 'بیزینس',
    ECONOMY: 'اکونومی',
    EXIT: 'ردیف خروج اضطراری',
  },
  en: {
    FIRST: 'First Class',
    BUSINESS: 'Business',
    ECONOMY: 'Economy Class',
    EXIT: 'Emergency exit row',
  },
  ar: {
    FIRST: 'الدرجة الأولى',
    BUSINESS: 'درجة الأعمال',
    ECONOMY: 'الدرجة الاقتصادية',
    EXIT: 'صف مخرج الطوارئ',
  },
};

/** Top-down seat icon matching MD-80-seatmap.pdf (chair with letter). */
function SeatIcon({
  letter,
  fill,
  stroke,
  text,
  large,
  exitRow,
}: {
  letter: string;
  fill: string;
  stroke: string;
  text: string;
  large?: boolean;
  exitRow?: boolean;
}) {
  const w = large ? 34 : 28;
  const h = large ? 36 : 30;
  return (
    <svg width={w} height={h} viewBox="0 0 28 30" aria-hidden>
      <rect x="4" y="2" width="20" height="8" rx="3" fill={fill} stroke={stroke} strokeWidth="1.5" />
      <rect x="3" y="10" width="22" height="16" rx="4" fill={fill} stroke={stroke} strokeWidth="1.5" />
      {exitRow && (
        <path
          d="M14 1 L17 5 H11 Z"
          fill="#e05252"
          stroke="#c0343a"
          strokeWidth="0.8"
        />
      )}
      <text
        x="14"
        y="21"
        textAnchor="middle"
        fill={text}
        fontSize="10"
        fontWeight="700"
        fontFamily="Inter, Vazirmatn, sans-serif"
      >
        {letter}
      </text>
    </svg>
  );
}

function AmenityIcon({
  kind,
  locale,
}: {
  kind: 'exit' | 'galley' | 'empty' | 'lav' | 'closet';
  locale: StoredLocale;
}) {
  if (kind === 'empty') {
    return <div className="h-9 w-[62px]" aria-hidden />;
  }
  const label =
    kind === 'exit'
      ? locale === 'en'
        ? 'EXIT'
        : locale === 'ar'
          ? 'مخرج'
          : 'خروج'
      : kind === 'galley'
        ? 'GALLEY'
        : kind === 'lav'
          ? locale === 'en'
            ? 'LAV'
            : locale === 'ar'
              ? 'دورة مياه'
              : 'سرویس'
          : locale === 'en'
            ? 'CLOSET'
            : locale === 'ar'
              ? 'خزانة'
              : 'کمد';
  return (
    <div
      className="flex h-9 min-w-[62px] flex-col items-center justify-center gap-0.5 rounded-md border border-[#b9c9dc] bg-[#eef4fb] px-1 text-[8px] font-bold text-[#4a6a8a]"
      aria-hidden
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        {kind === 'exit' && <path d="M9 6H5v12h4M13 12H5M15 8l4 4-4 4" />}
        {kind === 'galley' && (
          <>
            <path d="M8 3v7a4 4 0 0 0 8 0V3" />
            <path d="M12 14v7" />
            <path d="M8 21h8" />
          </>
        )}
        {kind === 'lav' && (
          <>
            <circle cx="9" cy="7" r="2.2" />
            <circle cx="15" cy="7" r="2.2" />
            <path d="M5 20c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5" />
            <path d="M11 20c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5" />
          </>
        )}
        {kind === 'closet' && (
          <>
            <path d="M6 21V8l6-4 6 4v13" />
            <path d="M12 4v6" />
            <path d="M9 11h6" />
          </>
        )}
      </svg>
      <span>{label}</span>
    </div>
  );
}

function SeatButton({
  seatCode,
  letter,
  cabin,
  status,
  selected,
  locked,
  exitRow,
  onToggle,
}: {
  seatCode: string;
  letter: string;
  cabin: CabinClass;
  status: 'FREE' | 'TAKEN';
  selected: boolean;
  locked: boolean;
  exitRow?: boolean;
  onToggle: (code: string) => void;
}) {
  const biz = cabin === 'BUSINESS';
  let fill = biz ? '#f4f6f8' : '#d8f3f1';
  let stroke = biz ? '#7aa7d4' : '#3aa8a0';
  let text = '#1a3a55';
  if (exitRow && status === 'FREE' && !selected && !locked) {
    fill = '#fde8e8';
    stroke = '#e09191';
  }
  if (status === 'TAKEN') {
    fill = '#f3c4d4';
    stroke = '#e091a8';
    text = '#8a4a5c';
  } else if (selected) {
    fill = '#1668c4';
    stroke = '#0d4f96';
    text = '#ffffff';
  } else if (locked) {
    fill = '#ece7d8';
    stroke = '#cfc4a0';
    text = '#9a8b5a';
  }

  return (
    <button
      type="button"
      disabled={status === 'TAKEN' || locked}
      onClick={() => onToggle(seatCode)}
      data-testid={`checkout-seat-${seatCode}`}
      className="inline-flex cursor-pointer items-center justify-center rounded p-0 disabled:cursor-not-allowed"
      title={seatCode}
      aria-label={seatCode}
    >
      <SeatIcon
        letter={letter}
        fill={fill}
        stroke={stroke}
        text={text}
        large={biz}
        exitRow={exitRow}
      />
    </button>
  );
}

function RowNum({ n, locale }: { n: number; locale: StoredLocale }) {
  return (
    <span className="w-5 flex-none text-center text-[10px] font-semibold text-[#6b7b94]">
      {localeDigits(n, locale)}
    </span>
  );
}

function ColumnHeaders({
  section,
}: {
  section: 'FIRST' | 'BUSINESS' | 'ECONOMY';
}) {
  const isFirst = section === 'FIRST';
  const rightCols = isFirst ? (['E', 'F'] as const) : (['D', 'E', 'F'] as const);
  return (
    <div className="mb-1.5 flex items-center justify-center gap-1 text-[9px] font-bold text-[#5a6678]">
      <span className="w-5" />
      {(['A', 'B'] as const).map((c) => (
        <span key={`hl-${c}`} className="w-[34px] text-center">
          {c}
        </span>
      ))}
      <span className="w-4" />
      {rightCols.map((c) => (
        <span key={`hr-${c}`} className="w-[34px] text-center">
          {c}
        </span>
      ))}
      {!isFirst && <span className="hidden" />}
      <span className="w-5" />
    </div>
  );
}

export default function Md80SeatMap({
  locale,
  seats,
  selectedSeats,
  onToggleSeat,
  businessLocked,
  bookedCabin,
  selectionLimitReached,
}: {
  locale: StoredLocale;
  seats: SeatMapCell[];
  selectedSeats: string[];
  onToggleSeat: (seatCode: string) => void;
  businessLocked: boolean;
  bookedCabin: CabinClass;
  selectionLimitReached: boolean;
}) {
  const takenFromApi = seats.filter((s) => s.status === 'TAKEN').map((s) => s.seatCode);
  const inventory = buildMd80Seats(takenFromApi);
  const byCode = new Map(inventory.map((s) => [s.seatCode, s]));
  for (const s of seats) {
    if (MD80_EXCLUDED.has(s.seatCode)) continue;
    if (s.cabin === 'COMFORT') continue;
    if (byCode.has(s.seatCode)) {
      const layoutSeat = byCode.get(s.seatCode)!;
      byCode.set(s.seatCode, {
        seatCode: s.seatCode,
        row: s.row,
        cabin: layoutSeat.cabin,
        status: s.status,
      });
    }
  }

  const sold = [...byCode.values()].filter((s) => s.status === 'TAKEN').length;
  const cap = byCode.size;
  const labels = SECTION_LABEL[locale];

  function seatState(code: string): 'FREE' | 'TAKEN' {
    return byCode.get(code)?.status === 'TAKEN' ? 'TAKEN' : 'FREE';
  }

  function isLocked(cabin: CabinClass, status: 'FREE' | 'TAKEN', code: string) {
    if (status === 'TAKEN') return true;
    if (cabin !== bookedCabin) return true;
    if (
      cabin === 'BUSINESS' &&
      businessLocked &&
      bookedCabin !== 'BUSINESS'
    )
      return true;
    if (selectionLimitReached && !selectedSeats.includes(code)) return true;
    return false;
  }

  let lastHeaderSection: 'FIRST' | 'BUSINESS' | 'ECONOMY' | null = null;

  return (
    <div
      className="max-h-[380px] overflow-auto rounded-[13px] border border-[#d5e2f0] bg-white p-3"
      data-testid="checkout-seat-map"
      data-aircraft="MD-80"
      data-capacity={cap}
      data-sold={sold}
    >
      <div dir="ltr" className="mx-auto w-fit min-w-[280px]">
        <div className="mb-1 flex items-end justify-between gap-3 px-1">
          <div className="flex gap-1">
            <AmenityIcon kind="closet" locale={locale} />
            <AmenityIcon kind="lav" locale={locale} />
          </div>
          <div className="pb-1 text-[10px] font-bold text-[#1668c4]">▲</div>
          <AmenityIcon kind="galley" locale={locale} />
        </div>
        <div className="mb-2 text-center text-[9px] font-bold tracking-wide text-[#8a96a6]">
          {locale === 'en' ? 'FRONT · MD-80' : locale === 'ar' ? 'مقدمة الطائرة · MD-80' : 'جلو هواپیما · MD-80'}
        </div>

        {md80Rows().map((row) => {
          const section = md80SectionForRow(row);
          const { left, right, cabin } = md80ColsForRow(row);
          const amenity = md80LeftAmenity(row);
          const biz = cabin === 'BUSINESS';
          const exitRow = md80IsExitRow(row);
          const inWing = row >= MD80_WING_ROW_START && row <= MD80_WING_ROW_END;
          const showHeader = lastHeaderSection !== section;
          if (showHeader) lastHeaderSection = section;

          return (
            <div key={row} className="relative">
              {showHeader && (
                <>
                  <ColumnHeaders section={section} />
                  <div
                    className={`mb-0.5 text-[9px] font-extrabold ${
                      section === 'FIRST'
                        ? 'text-[#a9781a]'
                        : section === 'BUSINESS'
                          ? 'text-[#96701a]'
                          : 'text-[#1668c4]'
                    }`}
                    data-testid={`checkout-section-${section.toLowerCase()}`}
                  >
                    {labels[section]}
                  </div>
                </>
              )}

              {row === MD80_WING_ROW_START && (
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 bottom-0 -z-10 rounded-lg bg-[#f4f8fc]/80"
                  aria-hidden
                />
              )}

              {exitRow && (
                <div className="mb-0.5 flex items-center justify-center gap-1 text-[8px] font-bold text-[#c0343a]">
                  <span>◀</span>
                  <span>{labels.EXIT}</span>
                  <span>▶</span>
                </div>
              )}

              <div
                className={`flex items-center justify-center gap-1 py-[2px] ${
                  inWing ? 'bg-[#f8fbff]' : ''
                } ${exitRow ? 'rounded-md border border-dashed border-[#f0c4c4] bg-[#fffafa]' : ''}`}
              >
                <RowNum n={row} locale={locale} />

                {amenity ? (
                  <div className="flex w-[70px] justify-center">
                    <AmenityIcon kind={amenity} locale={locale} />
                  </div>
                ) : (
                  left.map((letter) => {
                    const code = `${row}${letter}`;
                    const status = seatState(code);
                    return (
                      <SeatButton
                        key={code}
                        seatCode={code}
                        letter={letter}
                        cabin={cabin}
                        status={status}
                        selected={selectedSeats.includes(code)}
                        locked={isLocked(cabin, status, code)}
                        exitRow={exitRow}
                        onToggle={onToggleSeat}
                      />
                    );
                  })
                )}

                <span className="w-4 flex-none" aria-hidden />

                {biz && <span className="inline-block w-[34px]" aria-hidden />}

                {right.map((letter) => {
                  const code = `${row}${letter}`;
                  const status = seatState(code);
                  return (
                    <SeatButton
                      key={code}
                      seatCode={code}
                      letter={letter}
                      cabin={cabin}
                      status={status}
                      selected={selectedSeats.includes(code)}
                      locked={isLocked(cabin, status, code)}
                      exitRow={exitRow}
                      onToggle={onToggleSeat}
                    />
                  );
                })}

                <RowNum n={row} locale={locale} />
              </div>
            </div>
          );
        })}

        <div className="mt-2 flex items-start justify-between gap-3 px-1">
          <div className="flex gap-1">
            <AmenityIcon kind="closet" locale={locale} />
            <AmenityIcon kind="lav" locale={locale} />
          </div>
          <div className="flex gap-1">
            <AmenityIcon kind="closet" locale={locale} />
            <AmenityIcon kind="lav" locale={locale} />
          </div>
        </div>
        <div className="mt-1 text-center text-[9px] font-bold tracking-wide text-[#8a96a6]">
          {locale === 'en' ? 'REAR · MD-80' : locale === 'ar' ? 'مؤخرة الطائرة · MD-80' : 'عقب هواپیما · MD-80'}
        </div>
      </div>
    </div>
  );
}
