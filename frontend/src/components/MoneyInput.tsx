import { useRef, type ChangeEvent, type ClipboardEvent } from 'react';
import { formatTomanGrouped } from '../lib/money-input';
import type { MoneyInputProps } from './money-input-types';

function digitCountBefore(value: string, caret: number): number {
  let count = 0;
  const limit = Math.min(caret, value.length);
  for (let i = 0; i < limit; i++) {
    if (/\d|[۰-۹]|[٠-٩]/.test(value[i]!)) count += 1;
  }
  return count;
}

function caretFromDigitCount(formatted: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d|[۰-۹]|[٠-٩]/.test(formatted[i]!)) {
      seen += 1;
      if (seen >= digitCount) return i + 1;
    }
  }
  return formatted.length;
}

/** Reusable تومان money field for staff panels. Unit sits on the physical right. */
export default function MoneyInput({
  id,
  label,
  valueToman,
  onChangeToman,
  placeholder = '۰',
  disabled,
  className,
  'aria-label': ariaLabel,
  testId,
  theme = 'dark',
  locale = 'fa',
}: MoneyInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  function applyRaw(raw: string, caretDigits: number) {
    const next = formatTomanGrouped(raw, locale);
    onChangeToman(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const pos = caretFromDigitCount(next, caretDigits);
      el.setSelectionRange(pos, pos);
    });
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const caret = el.selectionStart ?? el.value.length;
    applyRaw(el.value, digitCountBefore(el.value, caret));
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const merged = el.value.slice(0, start) + text + el.value.slice(end);
    applyRaw(merged, digitCountBefore(merged, start + text.length));
  }

  return (
    <div className={className} data-testid={testId ? `${testId}-wrap` : undefined}>
      {label ? (
        <label className="mb-[7px] block text-[11.5px] text-[#9fb0c7]" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <div className="relative" data-testid={testId ? `${testId}-field` : 'money-input-field'}>
        <input
          ref={ref}
          id={id}
          data-testid={testId}
          dir="ltr"
          inputMode="numeric"
          disabled={disabled}
          aria-label={ariaLabel ?? label}
          placeholder={placeholder}
          value={valueToman}
          onChange={onChange}
          onPaste={onPaste}
          className={`h-11 w-full box-border rounded-[10px] border py-0 pl-3 pr-[3.25rem] text-left text-[13px] font-num outline-none ${
            theme === 'light'
              ? 'border-[#e3e9f1] bg-white text-[#16202e] focus:border-[#1668c4]'
              : 'border-[#28344c] bg-[#0f1726] text-[#e7ecf3]'
          }`}
        />
        <span
          data-testid={testId ? `${testId}-unit` : 'money-input-unit'}
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] font-bold ${theme === 'light' ? 'text-[#8a96a6]' : 'text-[#6b7b94]'}`}
        >
          {locale === 'en' ? 'Toman' : 'تومان'}
        </span>
      </div>
    </div>
  );
}
