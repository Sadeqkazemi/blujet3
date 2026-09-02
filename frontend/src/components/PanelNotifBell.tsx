import { useEffect, useRef, useState } from 'react';
import { faDigits } from '../lib/fa-format';
import { formatJalaliDate } from '../lib/jalali';
import type { LowSalesAlert } from '../types/reporting';

/**
 * Header notification dropdown for leftover low-sales alerts
 * (everything after the single dashboard banner).
 */
export default function PanelNotifBell({
  alerts,
  variant = 'light',
}: {
  alerts: LowSalesAlert[];
  variant?: 'light' | 'dark';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dark = variant === 'dark';
  const count = alerts.length;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-testid="panel-notif-toggle"
        aria-label="اعلان‌ها"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          dark
            ? 'relative flex h-[42px] w-[42px] items-center justify-center rounded-[10px] border border-[#28344c] bg-[#18223a] text-[#9fb0c7]'
            : 'relative flex h-[42px] w-[42px] items-center justify-center rounded-[10px] border border-border bg-white text-muted'
        }
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.5 21a2 2 0 0 1-3 0" />
        </svg>
        {count > 0 && (
          <span
            data-testid="panel-notif-badge"
            className="font-num absolute -top-1.5 -left-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#f87171] px-1 text-[10px] font-extrabold text-white"
          >
            {faDigits(count)}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[120]" onClick={() => setOpen(false)} />
          <div
            data-testid="panel-notif-dropdown"
            className={
              dark
                ? 'absolute top-[52px] left-0 z-[130] w-[340px] overflow-hidden rounded-[14px] border border-[#28344c] bg-[#141d2e] shadow-[0_20px_50px_-16px_rgba(0,0,0,.55)]'
                : 'absolute top-[52px] left-0 z-[130] w-[340px] overflow-hidden rounded-[14px] border border-border bg-white shadow-[0_20px_50px_-16px_rgba(13,38,64,.35)]'
            }
          >
            <div
              className={
                dark
                  ? 'border-b border-[#1f2a3d] px-3.5 py-3 text-[12.5px] font-extrabold text-white'
                  : 'border-b border-border px-3.5 py-3 text-[12.5px] font-extrabold text-ink'
              }
            >
              اعلان‌ها
              {count > 0 && (
                <span className="font-num mr-2 text-[11px] font-bold text-[#f87171]">
                  {faDigits(count)}
                </span>
              )}
            </div>
            {count === 0 ? (
              <p
                className={
                  dark
                    ? 'px-4 py-6 text-center text-[11.5px] text-[#6b7b94]'
                    : 'px-4 py-6 text-center text-[11.5px] text-muted'
                }
              >
                اعلان جدیدی وجود ندارد.
              </p>
            ) : (
              <ul className="max-h-[360px] overflow-y-auto py-1">
                {alerts.map((a) => (
                  <li
                    key={`${a.flightNo}-${a.departureAt}`}
                    className={
                      dark
                        ? 'border-b border-[#1f2a3d] px-3.5 py-3 last:border-b-0'
                        : 'border-b border-border px-3.5 py-3 last:border-b-0'
                    }
                  >
                    <div
                      className={
                        dark
                          ? 'text-[11.5px] font-bold text-[#fbbf24]'
                          : 'text-[11.5px] font-bold text-[#b45309]'
                      }
                    >
                      هشدار فروش ضعیف
                    </div>
                    <div
                      className={
                        dark
                          ? 'mt-1 text-[11px] leading-5 text-[#cdd7e5]'
                          : 'mt-1 text-[11px] leading-5 text-text-2'
                      }
                    >
                      پرواز <span className="ltr font-num inline-block">{a.flightNo}</span> {a.originCode} ←{' '}
                      {a.destCode} ({formatJalaliDate(a.departureAt)}) — {faDigits(a.soldSeats)} از{' '}
                      {faDigits(a.capacity)} صندلی
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
