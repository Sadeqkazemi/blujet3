import type { ReactNode } from 'react';
import { faDigits } from '../../lib/fa-format';

export type InternalCartableSummaryCard = {
  key: string;
  label: string;
  count: number;
  tone?: 'neutral' | 'blue' | 'green' | 'red' | 'amber';
  selected?: boolean;
  onSelect?: () => void;
};

const TONE_CLASS: Record<NonNullable<InternalCartableSummaryCard['tone']>, string> = {
  neutral: 'text-white',
  blue: 'text-[#60a5fa]',
  green: 'text-[#34d399]',
  red: 'text-[#f87171]',
  amber: 'text-[#f59e0b]',
};

export default function InternalCartableDashboard({
  description,
  cards,
  query,
  onQueryChange,
  actions,
}: {
  description: string;
  cards: InternalCartableSummaryCard[];
  query: string;
  onQueryChange: (value: string) => void;
  actions?: ReactNode;
}) {
  return (
    <section data-testid="internal-cartable-dashboard" className="mb-[15px] space-y-[15px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[#28446c] bg-[rgba(59,130,246,.14)] text-[#60a5fa]">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M4 5h16v14H4z" />
              <path d="M4 9h5l2 3h2l2-3h5" />
            </svg>
          </span>
          <div>
            <h1 className="m-0 text-[20.5px] font-black text-white">کارتابل داخلی</h1>
            <p className="mt-1 text-[11.5px] text-[#6b7b94]">{description}</p>
          </div>
        </div>
        {actions}
      </div>

      <div className={`grid grid-cols-2 gap-[11px] ${cards.length >= 5 ? 'lg:grid-cols-5' : 'md:grid-cols-4'}`}>
        {cards.map((card) => {
          const className = `rounded-[14px] border bg-[#141d2e] px-3 py-[11px] text-start transition ${
            card.selected
              ? 'border-[#3b82f6] shadow-[0_0_0_1px_rgba(59,130,246,.18)]'
              : 'border-[#1f2a3d]'
          } ${card.onSelect ? 'hover:border-[#34435f] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50' : ''}`;
          const content = (
            <>
              <div className="text-[11px] text-[#6b7b94]">{card.label}</div>
              <div className={`font-num mt-1 text-[20.5px] font-black ${TONE_CLASS[card.tone ?? 'neutral']}`}>
                {faDigits(card.count)}
              </div>
            </>
          );
          return card.onSelect ? (
            <button
              key={card.key}
              type="button"
              aria-label={`${card.label} ${faDigits(card.count)}`}
              aria-pressed={card.selected}
              onClick={card.onSelect}
              className={className}
            >
              {content}
            </button>
          ) : (
            <div key={card.key} className={className}>
              {content}
            </div>
          );
        })}
      </div>

      <div className="relative">
        <span className="pointer-events-none absolute right-[13px] top-1/2 -translate-y-1/2 text-[#6b7b94]">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </span>
        <input
          type="search"
          aria-label="جستجو در کارتابل داخلی"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="جستجو در عنوان، فرستنده یا محتوای کار…"
          className="h-11 w-full rounded-[12px] border border-[#28344c] bg-[#141d2e] py-0 pl-4 pr-[38px] text-[11.5px] text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
        />
      </div>
    </section>
  );
}
