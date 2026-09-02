import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { faDigits } from '../lib/fa-format';
import { isValidHhMm } from '../lib/flight-definition';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

const triggerClass =
  'w-full box-border h-11 rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3 text-[13px] text-[#e7ecf3] outline-none text-left font-num flex items-center justify-between gap-2';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseHhMm(value: string): { h: number; m: number } | null {
  if (!isValidHhMm(value)) return null;
  const [h, m] = value.split(':').map(Number);
  if (h == null || m == null) return null;
  return { h, m };
}

export interface TimePickerProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (hhMm: string) => void;
  disabled?: boolean;
  placeholder?: string;
  testId?: string;
  className?: string;
  'aria-label'?: string;
}

/** Dark RTL-friendly 24h HH:mm picker — never uses native browser time UI. */
export default function TimePicker({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder = 'HH:mm',
  testId = 'time-picker',
  className,
  'aria-label': ariaLabel,
}: TimePickerProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const parsed = parseHhMm(value);
  const [hour, setHour] = useState(parsed?.h ?? 8);
  const [minute, setMinute] = useState(parsed?.m ?? 0);

  useEffect(() => {
    const next = parseHhMm(value);
    if (!next) return;
    setHour(next.h);
    setMinute(next.m);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const display = useMemo(() => {
    if (!value) return '';
    return faDigits(value);
  }, [value]);

  function commit(h: number, m: number) {
    const next = `${pad2(h)}:${pad2(m)}`;
    onChange(next);
  }

  return (
    <div className={className} ref={rootRef} data-testid={testId}>
      {label ? (
        <label className="mb-[7px] block text-[11.5px] text-[#9fb0c7]" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className="relative">
        <button
          type="button"
          id={inputId}
          disabled={disabled}
          aria-label={ariaLabel ?? label ?? 'ساعت'}
          aria-expanded={open}
          aria-haspopup="dialog"
          data-testid={`${testId}-trigger`}
          onClick={() => !disabled && setOpen((v) => !v)}
          className={`${triggerClass} ${disabled ? 'opacity-60' : ''}`}
        >
          <span className={display ? 'text-[#e7ecf3]' : 'text-[#6b7b94]'} dir="ltr">
            {display || placeholder}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7b94" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </button>

        {open ? (
          <div
            role="dialog"
            aria-label="انتخاب ساعت"
            data-testid={`${testId}-popup`}
            className="absolute start-0 z-40 mt-1.5 w-[240px] rounded-[12px] border border-[#2a3a55] bg-[#141d2e] p-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,.7)]"
          >
            <div
              className="mb-3 grid grid-cols-2 gap-2"
              dir="ltr"
              data-testid="time-picker-columns"
            >
              <div>
                <div className="mb-1 text-right text-[10.5px] text-[#6b7b94]" dir="rtl">ساعت</div>
                <select
                  data-testid={`${testId}-hour`}
                  value={hour}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    setHour(h);
                  }}
                  className="h-10 w-full rounded-[9px] border border-[#28344c] bg-[#0f1726] px-2 font-num text-[13px] text-[#e7ecf3]"
                  dir="ltr"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {faDigits(pad2(h))}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1 text-right text-[10.5px] text-[#6b7b94]" dir="rtl">دقیقه</div>
                <select
                  data-testid={`${testId}-minute`}
                  value={minute}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    setMinute(m);
                  }}
                  className="h-10 w-full rounded-[9px] border border-[#28344c] bg-[#0f1726] px-2 font-num text-[13px] text-[#e7ecf3]"
                  dir="ltr"
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {faDigits(pad2(m))}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-2 rounded-[9px] border border-[#28344c] bg-[#0f1726] px-3 py-2 text-center font-num text-[14px] font-bold text-[#e7ecf3]" dir="ltr">
              {faDigits(`${pad2(hour)}:${pad2(minute)}`)}
            </div>
            <button
              type="button"
              data-testid={`${testId}-done`}
              onClick={() => {
                commit(hour, minute);
                setOpen(false);
              }}
              className="h-9 w-full rounded-[9px] bg-[#1668c4] text-[12px] font-bold text-white"
            >
              تأیید
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
