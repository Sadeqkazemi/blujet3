import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PanelNavItem } from '../types/panels';

/** Searches the current role's own nav pages (the only "menus/pages" the
 * shell actually knows about) and navigates on pick — a real filter over
 * real, permitted destinations, not a decorative input. */
export default function PanelSearchBox({ nav }: { nav: PanelNavItem[] }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return nav.filter((item) => item.labelFa.includes(q)).slice(0, 8);
  }, [nav, query]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function goTo(item: PanelNavItem) {
    setOpen(false);
    setQuery('');
    navigate(item.key === 'dashboard' ? '/panel' : `/panel/${item.key}`);
  }

  return (
    <div ref={ref} className="relative w-full max-w-xs">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-panel-muted-2" aria-hidden>
          🔍
        </span>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) goTo(results[0]);
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="جستجو…"
          aria-label="جستجو در صفحات این پنل"
          className="h-9 w-full rounded-lg border border-panel-border bg-panel-surface py-2 pe-3 ps-8 text-xs text-panel-ink shadow-sm outline-none transition placeholder:text-panel-muted-2 focus:border-accent"
        />
      </div>

      {open && query.trim() && (
        <div className="absolute right-0 z-20 mt-2 w-full rounded-xl border border-panel-border bg-panel-surface p-2 shadow-lg">
          {results.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-panel-muted">صفحه‌ای یافت نشد.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {results.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => goTo(item)}
                    className="block w-full rounded-lg px-2 py-2 text-start text-xs text-panel-ink transition hover:bg-panel-surface-2"
                  >
                    {item.labelFa}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
