import { useMemo, useState } from 'react';
import JalaliDatePicker from './JalaliDatePicker';
import { dayjs, isoDateAtNoon, toIsoDateOnly } from '../lib/jalali';
import { faDigits } from '../lib/fa-format';
import type { SalesGranularity } from '../types/reporting';

const MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

function recentJalaliMonths(count = 12) {
  const months: { label: string; periodStart: string }[] = [];
  let d = dayjs().calendar('jalali').startOf('month');
  for (let i = 0; i < count; i++) {
    months.push({
      label: `${MONTH_NAMES[d.month()]} ${faDigits(d.year())}`,
      periodStart: d.toDate().toISOString(),
    });
    d = d.subtract(1, 'month');
  }
  return months;
}

/** Saturday-first offset for Jalali month grids (matches panel design). */
function jalaliSaturdayOffset(monthStart: ReturnType<typeof dayjs>): number {
  // dayjs: 0=Sun … 6=Sat → Saturday-first index
  const dow = monthStart.day();
  return (dow + 1) % 7;
}

interface SalesChartControlsProps {
  modes: { key: SalesGranularity; label: string }[];
  granularity: SalesGranularity;
  onGranularityChange: (g: SalesGranularity) => void;
  selectedDate: string;
  onSelectedDateChange: (iso: string) => void;
  selectedMonthStart: string;
  onSelectedMonthStartChange: (iso: string) => void;
  flightNo: string;
  onFlightNoChange: (v: string) => void;
  onApplyFlightNo: () => void;
  variant?: 'pill' | 'segmented';
  theme?: 'light' | 'dark';
}

function DarkDayMonthGrid({
  selectedDate,
  onSelectedDateChange,
}: {
  selectedDate: string;
  onSelectedDateChange: (iso: string) => void;
}) {
  const selected = dayjs(selectedDate).calendar('jalali');
  const [viewMonth, setViewMonth] = useState(() => selected.startOf('month'));

  const daysInMonth = viewMonth.daysInMonth();
  const offset = jalaliSaturdayOffset(viewMonth.startOf('month'));
  const selectedKey = toIsoDateOnly(selected);
  const monthLabel = `${MONTH_NAMES[viewMonth.month()]} ${faDigits(viewMonth.year())}`;

  return (
    <div className="w-full max-w-sm rounded-[11px] border border-[#28344c] bg-[#18223a] p-3" data-testid="sales-chart-day-grid">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="ماه بعد"
          onClick={() => setViewMonth((m) => m.add(1, 'month').startOf('month'))}
          className="rounded-lg border border-[#28344c] px-2 py-1 text-[11px] text-[#9fb0c7] hover:text-white"
        >
          ‹
        </button>
        <span className="text-[12px] font-extrabold text-white">{monthLabel}</span>
        <button
          type="button"
          aria-label="ماه قبل"
          onClick={() => setViewMonth((m) => m.subtract(1, 'month').startOf('month'))}
          className="rounded-lg border border-[#28344c] px-2 py-1 text-[11px] text-[#9fb0c7] hover:text-white"
        >
          ›
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <span
            key={w}
            className={`py-0.5 text-center text-[9px] font-bold ${i === 6 ? 'text-[#f87171]' : 'text-[#6b7b94]'}`}
          >
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: offset }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const cell = viewMonth.startOf('month').add(i, 'day');
          const isoDay = toIsoDateOnly(cell);
          const selectedCell = isoDay === selectedKey;
          const friday = (offset + i) % 7 === 6;
          return (
            <button
              key={isoDay}
              type="button"
              onClick={() => onSelectedDateChange(isoDateAtNoon(isoDay))}
              className={`aspect-square rounded-lg border text-[11px] font-bold transition ${
                selectedCell
                  ? 'border-[#3b82f6] bg-[#3b82f6] text-white'
                  : friday
                    ? 'border-[#28344c] text-[#f87171] hover:border-[#3b82f6]'
                    : 'border-[#28344c] text-[#cdd7e5] hover:border-[#3b82f6]'
              }`}
            >
              {faDigits(day)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SalesChartControls({
  modes,
  granularity,
  onGranularityChange,
  selectedDate,
  onSelectedDateChange,
  selectedMonthStart,
  onSelectedMonthStartChange,
  flightNo,
  onFlightNoChange,
  onApplyFlightNo,
  variant = 'pill',
  theme = 'light',
}: SalesChartControlsProps) {
  const monthOptions = useMemo(() => recentJalaliMonths(), []);
  const dark = theme === 'dark';

  const modeButtons = modes.map((m) => (
    <button
      key={m.key}
      type="button"
      onClick={() => onGranularityChange(m.key)}
      className={
        dark
          ? `rounded-lg px-[11px] py-1.5 text-[11px] transition ${
              granularity === m.key
                ? 'bg-[#3b82f6] font-extrabold text-white'
                : 'font-medium text-[#9fb0c7] hover:text-white'
            }`
          : variant === 'segmented'
            ? `rounded-md px-3 py-1.5 text-[11px] transition ${
                granularity === m.key ? 'bg-accent font-bold text-white' : 'text-muted hover:text-ink'
              }`
            : `rounded-full px-3 py-1.5 text-xs font-medium transition ${
                granularity === m.key ? 'bg-accent text-white' : 'bg-surface text-text-2 hover:bg-surface-2'
              }`
      }
    >
      {m.label}
    </button>
  ));

  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          dark
            ? 'flex flex-wrap gap-[5px] rounded-[11px] border border-[#28344c] bg-[#18223a] p-[3px]'
            : variant === 'segmented'
              ? 'flex gap-1 rounded-lg border border-border bg-body p-1'
              : 'flex flex-wrap gap-1.5'
        }
      >
        {modeButtons}
      </div>

      {granularity === 'day' &&
        (dark ? (
          <DarkDayMonthGrid selectedDate={selectedDate} onSelectedDateChange={onSelectedDateChange} />
        ) : (
          <div className="max-w-xs rounded-lg border border-border bg-surface">
            <JalaliDatePicker
              label="تاریخ"
              value={selectedDate}
              onChange={onSelectedDateChange}
              testId="sales-chart-day"
            />
          </div>
        ))}

      {granularity === 'month' && (
        <div className="flex flex-wrap gap-1.5">
          {monthOptions.map((m) => (
            <button
              key={m.periodStart}
              type="button"
              onClick={() => onSelectedMonthStartChange(m.periodStart)}
              className={
                dark
                  ? `rounded-[9px] border px-3 py-1.5 text-[11px] font-medium transition ${
                      selectedMonthStart === m.periodStart
                        ? 'border-[#3b82f6] bg-[#3b82f6] font-bold text-white'
                        : 'border-[#28344c] bg-[#18223a] text-[#9fb0c7] hover:text-white'
                    }`
                  : `rounded-full px-3 py-1 text-[11px] font-medium transition ${
                      selectedMonthStart === m.periodStart
                        ? 'bg-accent text-white'
                        : 'bg-surface text-text-2 hover:bg-surface-2'
                    }`
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Dark analytic مالی owns its own flight search+cards (design). */}
      {granularity === 'flight' && !dark && (
        <div className="flex max-w-md gap-2">
          <input
            dir="ltr"
            aria-label="شماره پرواز"
            value={flightNo}
            onChange={(e) => onFlightNoChange(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onApplyFlightNo();
            }}
            placeholder="جستجوی شماره پرواز یا مسیر…"
            className="font-num h-10 flex-1 rounded-lg border border-border px-3 text-xs outline-none"
          />
          <button
            type="button"
            onClick={onApplyFlightNo}
            className="rounded-lg bg-accent px-4 text-xs font-bold text-white"
          >
            نمایش
          </button>
        </div>
      )}
    </div>
  );
}
