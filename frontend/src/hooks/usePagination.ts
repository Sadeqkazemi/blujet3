import { useEffect, useMemo, useState } from 'react';

export const PANEL_PAGE_SIZE = 10;

/**
 * Client-side pagination for panel list tables — 10 rows per page by default.
 * Resets to page 1 when the item count shrinks below the current window
 * (e.g. after filtering/search).
 */
export function usePagination<T>(items: T[], pageSize: number = PANEL_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return {
    page,
    setPage,
    totalPages,
    pageItems,
    pageSize,
    totalItems: items.length,
  };
}
