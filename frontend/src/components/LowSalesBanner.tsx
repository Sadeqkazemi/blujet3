import { faDigits, faMoney } from '../lib/fa-format';
import { formatJalaliDate } from '../lib/jalali';
import type { LowSalesAlert } from '../types/reporting';

/**
 * Dashboard/finance surface shows exactly ONE low-sales box.
 * Remaining alerts live in the panel notification bell (PanelShell).
 */
export default function LowSalesBanner({
  alert,
  variant = 'dark',
}: {
  alert: LowSalesAlert | null | undefined;
  variant?: 'light' | 'dark';
}) {
  if (!alert) return null;

  const dark = variant === 'dark';

  return (
    <div
      data-testid="low-sales-banner"
      className={
        dark
          ? 'mb-4 flex items-center gap-[11px] rounded-[14px] border border-[rgba(245,158,11,.35)] bg-[rgba(245,158,11,.08)] px-[15px] py-[13px]'
          : 'mb-6 flex items-center gap-3 rounded-xl border border-[#f59e0b59] bg-[#f59e0b14] p-4'
      }
    >
      <span
        className={
          dark
            ? 'flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-[rgba(245,158,11,.16)] text-[#f59e0b]'
            : 'flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#f59e0b29] text-[#b45309]'
        }
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </span>
      <div className="min-w-0 flex-1 leading-relaxed">
        <div
          className={
            dark
              ? 'text-[12.5px] font-extrabold text-[#fbbf24]'
              : 'text-xs font-extrabold text-[#b45309]'
          }
        >
          هشدار فروش ضعیف — در بازه ۷ روز مانده به پرواز
        </div>
        <div className={dark ? 'text-[11.5px] text-[#cdd7e5]' : 'mt-0.5 text-[11.5px] text-text-2'}>
          پرواز <span className="ltr font-num inline-block">{alert.flightNo}</span> {alert.originCode} ←{' '}
          {alert.destCode} ({formatJalaliDate(alert.departureAt)}) تنها {faDigits(alert.soldSeats)} از{' '}
          {faDigits(alert.capacity)} صندلی فروخته شده است. این هشدار برای مدیر عامل، مدیر ارشد، مدیر مالی و مدیر
          بازرگانی ارسال شد.
        </div>
        {alert.suggestedPriceIrr != null && (
          <div className="mt-2 rounded-lg bg-black/10 px-3 py-2 text-[11px] text-[#dce8f8]">
            پیشنهاد قیمت هوش مصنوعی: <strong className="font-num text-[#fbbf24]">{faMoney(alert.suggestedPriceIrr)} تومان</strong>
            {alert.reasonFa ? <span className="mr-2 text-[#aebbd0]">— {alert.reasonFa}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}
