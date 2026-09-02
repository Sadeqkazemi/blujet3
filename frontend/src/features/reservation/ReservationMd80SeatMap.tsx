import { faDigits } from '../../lib/fa-format';
import type { SeatCell, SeatStatus } from '../../types/reservation';
import {
  isMd80Aircraft,
  md80ColsForRow,
  md80IsExitRow,
  md80LeftAmenity,
  md80Rows,
  md80SectionForRow,
  MD80_EXCLUDED,
  MD80_TOTAL_SEATS,
  MD80_WING_ROW_END,
  MD80_WING_ROW_START,
  type Md80CabinSection,
} from '../public-site/checkout/md80-seat-layout';

/**
 * Interactive MD-80 seat chart for staff panels.
 * Layout source: design-reference-v2/MD-80-seatmap.pdf (user MD _ 80.pdf).
 */

const SECTION_LABEL: Record<Md80CabinSection, string> = {
  FIRST: 'کلاس یک (First Class)',
  BUSINESS: 'کابین اصلی با فضای پا بیشتر (Main Cabin Extra)',
  ECONOMY: 'کلاس اقتصادی (Economy)',
};

const SECTION_COLOR: Record<Md80CabinSection, string> = {
  FIRST: 'text-[#fbbf24]',
  BUSINESS: 'text-[#2dd4bf]',
  ECONOMY: 'text-[#9fb0c7]',
};

function seatTone(
  status: SeatStatus,
  selected: boolean,
  exitRow: boolean,
  highlight: boolean,
): { fill: string; stroke: string; text: string } {
  if (selected || highlight) return { fill: '#f59e0b', stroke: '#fbbf24', text: '#1a1206' };
  if (status === 'HELD') return { fill: '#0ea5e9', stroke: '#38bdf8', text: '#fff' };
  if (status === 'SOLD') return { fill: '#3b82f6', stroke: '#60a5fa', text: '#fff' };
  if (status === 'LOCKED') return { fill: '#f59e0b', stroke: '#fbbf24', text: '#1a1206' };
  if (status === 'BLOCKED') return { fill: '#a855f7', stroke: '#c084fc', text: '#fff' };
  if (exitRow) return { fill: '#1f1520', stroke: '#f0a8b4', text: '#f0a8b4' };
  return { fill: '#e8eef6', stroke: '#8aa4c0', text: '#1a3a55' };
}

/** Top-down chair icon matching the MD-80 PDF chart. */
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
        <path d="M14 1 L17 5 H11 Z" fill="#f87171" stroke="#ef4444" strokeWidth="0.8" />
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

function AmenityChip({
  kind,
}: {
  kind: 'exit' | 'galley' | 'empty' | 'lav' | 'closet';
}) {
  if (kind === 'empty') return <div className="h-9 w-[62px]" aria-hidden />;
  const label =
    kind === 'exit'
      ? 'خروج'
      : kind === 'galley'
        ? 'گالی'
        : kind === 'lav'
          ? 'سرویس'
          : 'کمد';
  return (
    <div
      className="flex h-9 min-w-[62px] flex-col items-center justify-center gap-0.5 rounded-md border border-[#2a4060] bg-[#132033] px-1 text-[8px] font-bold text-[#8fb4d8]"
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

function ExitArrow({ side }: { side: 'left' | 'right' }) {
  return (
    <span
      className={`inline-flex items-center text-[11px] font-black text-[#60a5fa] ${
        side === 'left' ? '' : 'scale-x-[-1]'
      }`}
      aria-hidden
    >
      ◀
    </span>
  );
}

function ColumnHeaders({ section }: { section: Md80CabinSection }) {
  const rightCols = section === 'FIRST' ? (['E', 'F'] as const) : (['D', 'E', 'F'] as const);
  return (
    <div className="mb-1 flex items-center justify-center gap-1 text-[9px] font-bold text-[#6b7b94]">
      <span className="w-4" />
      {(['A', 'B'] as const).map((c) => (
        <span key={`hl-${c}`} className="w-[34px] text-center">
          {c}
        </span>
      ))}
      <span className="w-7" />
      {section === 'FIRST' && <span className="w-[34px]" aria-hidden />}
      {rightCols.map((c) => (
        <span key={`hr-${c}`} className="w-[34px] text-center">
          {c}
        </span>
      ))}
      <span className="w-4" />
    </div>
  );
}

export { isMd80Aircraft, MD80_TOTAL_SEATS };

export default function ReservationMd80SeatMap({
  seatsByCode,
  selectedSeatCode,
  highlightSeatCode,
  canLock,
  onSeatClick,
}: {
  seatsByCode: Map<string, SeatCell>;
  selectedSeatCode: string | null;
  highlightSeatCode?: string | null;
  canLock: boolean;
  onSeatClick: (seat: SeatCell) => void;
}) {
  let lastHeader: Md80CabinSection | null = null;

  function resolveCell(code: string): SeatCell {
    return (
      seatsByCode.get(code) ?? {
        seatCode: code,
        status: 'FREE',
        lockId: null,
        occupant: null,
      }
    );
  }

  function renderSeat(code: string, letter: string, first: boolean, exitRow: boolean) {
    if (MD80_EXCLUDED.has(code)) return null;
    const cell = resolveCell(code);
    const selected = selectedSeatCode === code;
    const highlight = highlightSeatCode === code;
    const tone = seatTone(cell.status, selected, exitRow, highlight);
    return (
      <button
        key={code}
        type="button"
        onClick={() => onSeatClick(cell)}
        aria-label={code}
        title={canLock ? code : `${code} — فقط مشاهده`}
        className={`inline-flex cursor-pointer items-center justify-center rounded p-0 ${
          highlight ? 'ring-2 ring-[#fcd34d]' : ''
        } ${selected ? 'ring-2 ring-white' : ''}`}
      >
        <SeatIcon
          letter={letter}
          fill={tone.fill}
          stroke={tone.stroke}
          text={tone.text}
          large={first}
          exitRow={exitRow}
        />
      </button>
    );
  }

  return (
    <div
      className="overflow-x-auto overflow-y-visible rounded-[16px] border border-[#1c2740] bg-[#0a1220] p-3"
      data-testid="reservation-md80-seat-map"
      data-aircraft="MD-80"
    >
      {/* Fuselage shell — matches PDF capsule outline */}
      <div
        dir="ltr"
        className="relative mx-auto w-fit min-w-[300px] rounded-[40px] border-[1.5px] border-[#3a5478] bg-gradient-to-b from-[#101b2e] via-[#0d1626] to-[#0b1220] px-3 py-4 shadow-[inset_0_0_40px_rgba(30,60,100,.25)]"
      >
        <div className="pointer-events-none absolute inset-x-6 top-0 h-3 rounded-b-full bg-[#1a2a42]/60" />

        <div className="mb-1 flex items-end justify-between gap-3 px-1">
          <div className="flex gap-1">
            <AmenityChip kind="closet" />
            <AmenityChip kind="lav" />
          </div>
          <div className="pb-1 text-[10px] font-bold text-[#60a5fa]">▲</div>
          <AmenityChip kind="galley" />
        </div>
        <div className="mb-2 text-center text-[9px] font-bold tracking-wide text-[#5b6b83]">
          جلو هواپیما · MD-80
        </div>

        {md80Rows().map((row) => {
          const section = md80SectionForRow(row);
          const { left, right } = md80ColsForRow(row);
          const amenity = md80LeftAmenity(row);
          const first = section === 'FIRST';
          const exitRow = md80IsExitRow(row);
          const inWing = row >= MD80_WING_ROW_START && row <= MD80_WING_ROW_END;
          const showHeader = lastHeader !== section;
          if (showHeader) lastHeader = section;

          return (
            <div key={row} className="relative">
              {showHeader && (
                <>
                  <ColumnHeaders section={section} />
                  <div
                    className={`mb-0.5 text-center text-[9px] font-extrabold ${SECTION_COLOR[section]}`}
                    data-testid={`reservation-section-${section.toLowerCase()}`}
                  >
                    {SECTION_LABEL[section]}
                  </div>
                </>
              )}

              {exitRow && (
                <div className="mb-0.5 flex items-center justify-center gap-2 text-[8px] font-bold text-[#60a5fa]">
                  <ExitArrow side="left" />
                  <span>خروج اضطراری · ردیف {faDigits(row)}</span>
                  <ExitArrow side="right" />
                </div>
              )}

              <div
                className={`flex items-center justify-center gap-1 py-[2px] ${
                  inWing ? 'rounded-md bg-[#121c2e]/80' : ''
                } ${exitRow ? 'rounded-md border border-dashed border-[#3b6ea0] bg-[#122033]/70' : ''}`}
              >
                {exitRow ? <ExitArrow side="left" /> : <span className="w-3" aria-hidden />}

                {amenity ? (
                  <div className="flex w-[70px] justify-center">
                    <AmenityChip kind={amenity} />
                  </div>
                ) : (
                  left.map((letter) => renderSeat(`${row}${letter}`, letter, first, exitRow))
                )}

                {/* Center aisle — row number like the PDF */}
                <span
                  data-testid={`aisle-gap-${row}`}
                  className="font-num flex w-7 flex-none items-center justify-center text-[10px] font-bold text-[#7d8aa0]"
                >
                  {faDigits(row)}
                </span>

                {/* First class has no D column — spacer keeps E/F aligned with economy */}
                {first && <span className="inline-block w-[34px]" aria-hidden />}

                {right.map((letter) => renderSeat(`${row}${letter}`, letter, first, exitRow))}

                {exitRow ? <ExitArrow side="right" /> : <span className="w-3" aria-hidden />}
              </div>
            </div>
          );
        })}

        <div className="mt-2 flex items-start justify-between gap-3 px-1">
          <div className="flex gap-1">
            <AmenityChip kind="closet" />
            <AmenityChip kind="lav" />
          </div>
          <div className="flex gap-1">
            <AmenityChip kind="closet" />
            <AmenityChip kind="lav" />
          </div>
        </div>
        <div className="mt-1 text-center text-[9px] font-bold tracking-wide text-[#5b6b83]">
          عقب هواپیما · MD-80
        </div>
      </div>
    </div>
  );
}
