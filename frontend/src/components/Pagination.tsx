import { faDigits } from '../lib/fa-format';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** Dark staff panels vs light public/results chrome. */
  variant?: 'dark' | 'light';
  className?: string;
  previousLabel?: string;
  nextLabel?: string;
  /** Optional locale-aware page number formatter. Defaults to Persian digits for staff panels. */
  formatPage?: (page: number) => string;
}

/**
 * Shared pager for panel list tables.
 * Hidden when there is only one page.
 */
export default function Pagination({
  page,
  totalPages,
  onChange,
  variant = 'dark',
  className = '',
  previousLabel = 'قبلی',
  nextLabel = 'بعدی',
  formatPage = (value) => faDigits(value),
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const dark = variant === 'dark';
  const btnBase = dark
    ? 'h-[42px] rounded-[11px] border border-panel-border bg-panel-surface-2 text-[13px] font-bold text-panel-muted transition hover:border-accent hover:text-panel-ink disabled:cursor-default disabled:opacity-40'
    : 'h-[42px] rounded-[11px] border border-[#e6eaf0] bg-white text-[13px] font-bold text-[#5a6678] transition hover:border-[#cfd6e0] disabled:cursor-default disabled:opacity-40';
  const pageActive = dark
    ? 'h-[42px] w-[42px] rounded-[11px] bg-[#3b82f6] text-[13px] font-extrabold text-white'
    : 'h-[42px] w-[42px] rounded-[11px] bg-[#1668c4] text-[13px] font-extrabold text-white';
  const pageIdle = dark
    ? 'h-[42px] w-[42px] rounded-[11px] border border-panel-border bg-panel-surface-2 text-[13px] font-semibold text-panel-muted transition hover:border-accent hover:text-panel-ink'
    : 'h-[42px] w-[42px] rounded-[11px] border border-[#e6eaf0] bg-white text-[13px] font-semibold text-[#5a6678] transition hover:border-[#cfd6e0]';

  // Show a compact window of page numbers when there are many pages.
  const windowSize = 7;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);

  return (
    <nav
      aria-label="صفحه‌بندی"
      className={`mt-6 flex flex-wrap items-center justify-center gap-[7px] ${className}`}
      data-testid="pagination"
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className={`${btnBase} px-[15px]`}
      >
        {previousLabel}
      </button>
      {start > 1 && (
        <>
          <button type="button" onClick={() => onChange(1)} className={pageIdle}>
            {formatPage(1)}
          </button>
          {start > 2 && <span className="px-1 text-[#6b7b94]">…</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          aria-current={p === page ? 'page' : undefined}
          onClick={() => onChange(p)}
          className={p === page ? pageActive : pageIdle}
        >
          {formatPage(p)}
        </button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-[#6b7b94]">…</span>}
          <button type="button" onClick={() => onChange(totalPages)} className={pageIdle}>
            {formatPage(totalPages)}
          </button>
        </>
      )}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className={`${btnBase} px-[15px]`}
      >
        {nextLabel}
      </button>
    </nav>
  );
}
