import { useEffect, useState } from 'react';
import { fetchSystemLogs } from '../../api/it-manager';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { formatJalaliDateTime } from '../../lib/jalali';
import type { AuditLogRow } from '../../types/it-manager';

const LEVEL_LABEL: Record<AuditLogRow['level'], { label: string; className: string }> = {
  info: { label: 'info', className: 'bg-[rgba(59,130,246,.14)] text-[#60a5fa]' },
  warn: { label: 'warn', className: 'bg-[rgba(245,158,11,.14)] text-[#f59e0b]' },
  error: { label: 'error', className: 'bg-[rgba(248,113,113,.14)] text-[#f87171]' },
};

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const logsPager = usePagination(logs ?? [], 5);

  useEffect(() => {
    fetchSystemLogs({ page: 1, limit: 100 })
      .then(setLogs)
      .catch(() => setError('خطا در دریافت لاگ‌ها.'));
  }, []);

  return (
    <div className="p-8">
      <h1 className="mb-1 text-[20.5px] font-black text-white">لاگ و رویدادها</h1>
      <p className="mb-6 text-[12.5px] text-[#6b7b94]">رصد فعالیت‌ها و رخدادهای سامانه</p>

      {error && (
        <p className="mb-4 rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">{error}</p>
      )}

      <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
        <h2 className="text-[14.5px] font-extrabold text-white">لاگ‌ها و رویدادهای سامانه</h2>
        <p className="mb-4 mt-1 text-[11.5px] text-[#6b7b94]">
          فعالیت‌های ثبت‌شدهٔ کارمندان واحدها — اقدامات و ایجاد حساب‌ها
        </p>

        <div className="overflow-hidden rounded-xl border border-[#1f2a3d]">
          <div className="grid grid-cols-[0.9fr_1.2fr_2.4fr_0.9fr_0.7fr] gap-2 bg-[#18223a] px-[11px] py-2.5 text-[10.5px] font-bold text-[#6b7b94]">
            <span>زمان</span>
            <span>کارمند</span>
            <span>رویداد</span>
            <span>واحد</span>
            <span>سطح</span>
          </div>
          {logs === null ? (
            <p className="border-t border-[#1f2a3d] py-8 text-center text-xs text-[#6b7b94]">
              در حال بارگذاری…
            </p>
          ) : logs.length === 0 ? (
            <p className="border-t border-[#1f2a3d] py-[22px] text-center text-xs text-[#6b7b94]">
              فعالیتی از کارمندان ثبت نشده است.
            </p>
          ) : (
            <ul>
              {logsPager.pageItems.map((l) => {
                const lvl = LEVEL_LABEL[l.level] ?? LEVEL_LABEL.info;
                return (
                  <li
                    key={l.id}
                    data-testid="system-log-row"
                    className="grid grid-cols-[0.9fr_1.2fr_2.4fr_0.9fr_0.7fr] items-center gap-2 border-t border-[#1f2a3d] px-[11px] py-2.5 text-[11.5px]"
                  >
                    <span className="font-num ltr text-[#6b7b94]">{formatJalaliDateTime(l.createdAt)}</span>
                    <span className="font-semibold text-[#cdd6e3]">{l.actorName}</span>
                    <span className="text-[#9fb0c7]">
                      {l.action} — {l.detail}
                    </span>
                    <span className="text-[#9fb0c7]">{l.unit}</span>
                    <span className={`w-fit rounded-full px-[7px] py-0.5 text-[10px] font-bold ${lvl.className}`}>
                      {lvl.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Pagination
          page={logsPager.page}
          totalPages={logsPager.totalPages}
          onChange={logsPager.setPage}
          variant="dark"
        />
      </section>
    </div>
  );
}
