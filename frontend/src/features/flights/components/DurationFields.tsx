import {
  formatDurationFa,
  minutesFromDuration,
} from "../../../lib/flight-definition";
import { faDigits } from "../../../lib/fa-format";

const selectClass =
  "w-full box-border h-11 rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-[13px] text-[#e7ecf3] outline-none font-num";

const HOUR_OPTS = Array.from({ length: 25 }, (_, i) => i);
const MINUTE_OPTS = Array.from({ length: 12 }, (_, i) => i * 5);

export default function DurationFields({
  hours,
  minutes,
  onHours,
  onMinutes,
  showError,
  disabled = false,
}: {
  hours: number;
  minutes: number;
  onHours: (h: number) => void;
  onMinutes: (m: number) => void;
  showError?: boolean;
  disabled?: boolean;
}) {
  const total = minutesFromDuration(hours, minutes);
  const invalid = showError && total == null;
  return (
    <div data-testid="duration-fields">
      <span className="mb-[7px] block text-[11.5px] text-[#9fb0c7]">
        مدت پرواز *
      </span>
      {/* Same outer label rhythm as sibling form fields; no nested labels that shift controls down. */}
      <div className="grid grid-cols-2 gap-2">
        <select
          id="af-dur-h"
          data-testid="duration-hours"
          aria-label="ساعت مدت پرواز"
          value={hours}
          disabled={disabled}
          onChange={(e) => onHours(Number(e.target.value))}
          className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-60`}
          dir="ltr"
        >
          {HOUR_OPTS.map((h) => (
            <option key={h} value={h}>
              {faDigits(h)} ساعت
            </option>
          ))}
        </select>
        <select
          id="af-dur-m"
          data-testid="duration-minutes"
          aria-label="دقیقه مدت پرواز"
          value={minutes}
          disabled={disabled}
          onChange={(e) => onMinutes(Number(e.target.value))}
          className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-60`}
          dir="ltr"
        >
          {MINUTE_OPTS.map((m) => (
            <option key={m} value={m}>
              {faDigits(m)} دقیقه
            </option>
          ))}
        </select>
      </div>
      {total != null ? (
        <p
          className="mt-1.5 text-[11px] text-[#9fb0c7]"
          data-testid="duration-summary"
        >
          {formatDurationFa(total)}
        </p>
      ) : invalid ? (
        <p
          role="alert"
          className="mt-1.5 text-[11px] font-semibold text-[#f87171]"
        >
          مدت پرواز نمی‌تواند صفر باشد
        </p>
      ) : null}
    </div>
  );
}
