import { useState } from 'react';
import { faMoney, faMoneyCompactNumber } from '../lib/fa-format';
import { formatJalaliDate } from '../lib/jalali';
import type { SalesChartPeriod } from '../types/reporting';

// Categorical palette validated with the dataviz skill's six-checks script
// (light + dark surfaces) — see chat history for the validation run.
const SERIES_LIGHT = [
  { key: 'systemIrr', label: 'سیستمی', color: '#1668c4' },
  { key: 'charterIrr', label: 'چارتر', color: '#a855f7' },
  { key: 'agencyIrr', label: 'آژانس', color: '#059669' },
] as const;

const SERIES_DARK = [
  { key: 'systemIrr', label: 'سیستمی', color: '#3b82f6' },
  { key: 'charterIrr', label: 'چارتر', color: '#a855f7' },
  { key: 'agencyIrr', label: 'آژانس', color: '#34d399' },
] as const;

interface SalesBarChartProps {
  periods: SalesChartPeriod[];
  selectedPeriodKey: string | null;
  onSelectPeriod: (key: string | null) => void;
  theme?: 'light' | 'dark';
}

export default function SalesBarChart({
  periods,
  selectedPeriodKey,
  onSelectPeriod,
  theme = 'light',
}: SalesBarChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [tableView, setTableView] = useState(false);
  const SERIES = theme === 'dark' ? SERIES_DARK : SERIES_LIGHT;
  const dark = theme === 'dark';
  const formatAmount = dark ? faMoneyCompactNumber : faMoney;

  // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON on
  // the backend) — parsed here for this display-only chart; period totals
  // are far below 2^53 so Number() loses no precision.
  const totals = periods.map(
    (p) => Number(p.systemIrr) + Number(p.charterIrr) + Number(p.agencyIrr),
  );
  const max = Math.max(1, ...totals);

  return (
    <div>
      {!dark && (
        <div className="mb-3 flex items-center justify-between">
          <div className="flex flex-wrap gap-4">
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 text-xs text-text-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                {s.label}
              </div>
            ))}
          </div>
          <button
            onClick={() => setTableView((v) => !v)}
            className="text-[11px] text-muted underline decoration-dotted"
          >
            {tableView ? 'نمایش نموداری' : 'نمایش جدولی'}
          </button>
        </div>
      )}

      {tableView && !dark ? (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs text-panel-ink">
            <thead>
              <tr className={`border-b ${dark ? 'border-[#1f2a3d] text-[#6b7b94]' : 'border-border text-muted'}`}>
                <th className="py-2 text-start font-medium">دوره</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="py-2 text-start font-medium">
                    {s.label}
                  </th>
                ))}
                <th className="py-2 text-start font-medium">جمع</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr
                  key={p.periodKey}
                  className={`font-num border-b ${dark ? 'border-[#1f2a3d] text-[#e7ecf3]' : 'border-border/60'}`}
                >
                  <td className="py-2">{formatJalaliDate(p.startDate)}</td>
                  <td className="py-2">{faMoney(p.systemIrr)}</td>
                  <td className="py-2">{faMoney(p.charterIrr)}</td>
                  <td className="py-2">{faMoney(p.agencyIrr)}</td>
                  <td className="py-2 font-bold">
                    {faMoney(Number(p.systemIrr) + Number(p.charterIrr) + Number(p.agencyIrr))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex h-[230px] items-stretch gap-2" role="img" aria-label="نمودار فروش دوره‌ای">
          {periods.map((p, i) => {
            const isSelected = selectedPeriodKey === p.periodKey;
            const isHovered = hovered === p.periodKey;
            const barHeightPct = (totals[i] / max) * 100;
            return (
              <div key={p.periodKey} className="relative flex flex-1 flex-col items-center justify-end gap-[7px]">
                <div
                  className={`font-num text-[10px] font-extrabold whitespace-nowrap ${
                    dark ? 'text-[#e7ecf3]' : 'text-ink'
                  }`}
                >
                  {formatAmount(totals[i])}
                </div>
                {isHovered && (
                  <div
                    className={`absolute -top-16 z-10 w-max rounded-lg border p-2 text-[11px] shadow-lg ${
                      dark
                        ? 'border-[#28344c] bg-[#141d2e] text-[#e7ecf3]'
                        : 'border-border bg-white'
                    }`}
                  >
                    <div className="mb-1 font-bold">{formatJalaliDate(p.startDate)}</div>
                    {SERIES.map((s) => (
                      <div key={s.key} className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: s.color }} />
                        <span className="font-num">{formatAmount(p[s.key])}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setHovered(p.periodKey)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onSelectPeriod(isSelected ? null : p.periodKey)}
                  className="flex w-full max-w-[38px] flex-col justify-end overflow-hidden rounded-t-md outline-none"
                  style={{
                    height: `${Math.max(barHeightPct, 2)}%`,
                    opacity: selectedPeriodKey && !isSelected ? 0.4 : 1,
                    outline: isSelected ? `2px solid ${dark ? '#3b82f6' : '#16202e'}` : undefined,
                    outlineOffset: isSelected ? '3px' : undefined,
                  }}
                  aria-pressed={isSelected}
                  aria-label={`${formatJalaliDate(p.startDate)} — جمع ${formatAmount(totals[i])}`}
                >
                  {/* Stack bottom→top: agency, charter, system to match design gradients */}
                  {[...SERIES].reverse().map((s) => {
                    const segTotal = totals[i] || 1;
                    const segPct = (Number(p[s.key]) / segTotal) * 100;
                    return (
                      <div key={s.key} style={{ height: `${segPct}%`, backgroundColor: s.color }} />
                    );
                  })}
                </button>
                <div
                  className={`text-[10px] whitespace-nowrap ${
                    isSelected
                      ? dark
                        ? 'font-bold text-white'
                        : 'font-bold text-ink'
                      : dark
                        ? 'text-[#6b7b94]'
                        : 'text-muted'
                  }`}
                >
                  {formatJalaliDate(p.startDate)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
